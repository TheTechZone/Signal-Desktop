// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable @typescript-eslint/no-namespace */

import { escapeRegExp, isNumber } from 'lodash';

import { SignalService as Proto } from '../protobuf';
import * as log from '../logging/log';
import { assertDev } from '../util/assert';

// Cold storage of body ranges

export type BodyRange<T extends object> = {
  start: number;
  length: number;
} & T;

/** Body range as parsed from proto (No "Link" since those don't come from proto) */
export type RawBodyRange = BodyRange<BodyRange.Mention | BodyRange.Formatting>;

export enum DisplayStyle {
  SearchKeywordHighlight = 'SearchKeywordHighlight',
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace BodyRange {
  // re-export for convenience
  export type Style = Proto.DataMessage.BodyRange.Style;
  export const { Style } = Proto.DataMessage.BodyRange;

  export type Mention = {
    mentionUuid: string;
  };
  export type Link = {
    url: string;
  };
  export type Formatting = {
    style: Style;
  };
  export type DisplayOnly = {
    displayStyle: DisplayStyle;
  };

  // these overloads help inference along
  export function isMention(
    bodyRange: HydratedBodyRangeType
  ): bodyRange is HydratedBodyRangeMention;
  export function isMention(
    bodyRange: BodyRange<object>
  ): bodyRange is BodyRange<Mention>;
  export function isMention<T extends object, X extends BodyRange<Mention> & T>(
    bodyRange: BodyRange<T>
  ): bodyRange is X {
    // satisfies keyof Mention
    return ('mentionUuid' as const) in bodyRange;
  }
  export function isFormatting(
    bodyRange: BodyRange<object>
  ): bodyRange is BodyRange<Formatting> {
    // satisfies keyof Formatting
    return ('style' as const) in bodyRange;
  }

  export function isLink<T extends Mention | Link | Formatting | DisplayOnly>(
    node: T
  ): node is T & Link {
    // satisfies keyof Link
    return ('url' as const) in node;
  }
  export function isDisplayOnly<
    T extends Mention | Link | Formatting | DisplayOnly
  >(node: T): node is T & DisplayOnly {
    // satisfies keyof DisplayOnly
    return ('displayStyle' as const) in node;
  }
}

// Used exclusive in CompositionArea and related conversation_view.tsx calls.

export type DraftBodyRangeMention = BodyRange<
  BodyRange.Mention & {
    replacementText: string;
  }
>;

// Fully hydrated body range to be used in UI components.

export type HydratedBodyRangeMention = DraftBodyRangeMention & {
  conversationID: string;
};

export type HydratedBodyRangeType =
  | HydratedBodyRangeMention
  | BodyRange<BodyRange.Formatting>;

export type HydratedBodyRangesType = ReadonlyArray<HydratedBodyRangeType>;

export type DisplayBodyRangeType =
  | HydratedBodyRangeType
  | BodyRange<BodyRange.DisplayOnly>;
export type BodyRangesForDisplayType = ReadonlyArray<DisplayBodyRangeType>;

type HydratedMention = BodyRange.Mention & {
  conversationID: string;
  replacementText: string;
};

/**
 * A range that can contain other nested ranges
 * Inner range start fields are relative to the start of the containing range
 */
export type RangeNode = BodyRange<
  (
    | HydratedMention
    | BodyRange.Link
    | BodyRange.Formatting
    | BodyRange.DisplayOnly
  ) & {
    ranges: ReadonlyArray<RangeNode>;
  }
>;

// We want mentions last, so they are fully wrapped by other ranges.
// We want longer ranges first, because they logically contain others
// We want ranges that come earlier in the text first, just to make things easy.
export function sortRanges(
  ranges: Array<DisplayBodyRangeType>
): BodyRangesForDisplayType {
  return ranges.sort((a, b) => {
    if (BodyRange.isMention(a)) {
      if (BodyRange.isMention(b)) {
        return 0;
      }
      return 1;
    }
    if (BodyRange.isMention(b)) {
      return -1;
    }

    // Descending order
    if (a.length !== b.length) {
      return b.length - a.length;
    }

    // Ascending order
    return a.start - b.start;
  });
}

/**
 * Insert a range into an existing range tree, splitting up the range if it intersects
 * with an existing range
 *
 * @param range The range to insert the tree
 * @param rangeTree A list of nested non-intersecting range nodes, these starting ranges
 *  will not be split up
 */
export function insertRange(
  range: BodyRange<
    | HydratedMention
    | BodyRange.Link
    | BodyRange.Formatting
    | BodyRange.DisplayOnly
  >,
  rangeTree: ReadonlyArray<RangeNode>
): ReadonlyArray<RangeNode> {
  const [current, ...rest] = rangeTree;

  if (!current) {
    return [{ ...range, ranges: [] }];
  }
  const rangeEnd = range.start + range.length;
  const currentEnd = current.start + current.length;

  // ends before current starts
  if (rangeEnd <= current.start) {
    return [{ ...range, ranges: [] }, current, ...rest];
  }

  // starts after current one ends
  if (range.start >= currentEnd) {
    return [current, ...insertRange(range, rest)];
  }

  // range is contained by first
  if (range.start >= current.start && rangeEnd <= currentEnd) {
    return [
      {
        ...current,
        ranges: insertRange(
          { ...range, start: range.start - current.start },
          current.ranges
        ),
      },
      ...rest,
    ];
  }

  // range contains first (but might contain more)
  // split range into 3
  if (range.start < current.start && rangeEnd > currentEnd) {
    return [
      { ...range, length: current.start - range.start, ranges: [] },
      {
        ...current,
        ranges: insertRange(
          { ...range, start: 0, length: current.length },
          current.ranges
        ),
      },
      ...insertRange(
        { ...range, start: currentEnd, length: rangeEnd - currentEnd },
        rest
      ),
    ];
  }

  // range intersects beginning
  // split range into 2
  if (range.start < current.start && rangeEnd <= currentEnd) {
    return [
      { ...range, length: current.start - range.start, ranges: [] },
      {
        ...current,
        ranges: insertRange(
          {
            ...range,
            start: 0,
            length: range.length - (current.start - range.start),
          },
          current.ranges
        ),
      },
      ...rest,
    ];
  }

  // range intersects ending
  // split range into 2
  if (range.start >= current.start && rangeEnd > currentEnd) {
    return [
      {
        ...current,
        ranges: insertRange(
          {
            ...range,
            start: range.start - current.start,
            length: currentEnd - range.start,
          },
          current.ranges
        ),
      },
      ...insertRange(
        {
          ...range,
          start: currentEnd,
          length: range.length - (currentEnd - range.start),
        },
        rest
      ),
    ];
  }

  log.error(`MessageTextRenderer: unhandled range ${range}`);
  throw new Error('unhandled range');
}

const TRUNCATION_PLACEHOLDER = '<<truncation>>';
const TRUNCATION_CHAR = '...';
const LENGTH_OF_LEFT = '<<left>>'.length;

// This function exists because bodyRanges tells us the character position
// where the at-mention starts at according to the full body text. The snippet
// we get back is a portion of the text and we don't know where it starts. This
// function will find the relevant bodyRanges that apply to the snippet and
// then update the proper start position of each body range.
export function processBodyRangesForSearchResult({
  snippet,
  body,
  bodyRanges,
}: {
  snippet: string;
  body: string;
  bodyRanges: HydratedBodyRangesType;
}): {
  cleanedSnippet: string;
  bodyRanges: BodyRangesForDisplayType;
} {
  // Find where the snippet starts in the full text
  const cleanedSnippet = snippet
    .replace(/<<left>>/g, '')
    .replace(/<<right>>/g, '');
  const withNoStartTruncation = cleanedSnippet.replace(/^<<truncation>>/, '');
  const withNoEndTruncation = withNoStartTruncation.replace(
    /<<truncation>>$/,
    ''
  );
  const finalSnippet = cleanedSnippet
    .replace(/^<<truncation>>/, TRUNCATION_CHAR)
    .replace(/<<truncation>>$/, TRUNCATION_CHAR);
  const truncationDelta =
    withNoStartTruncation.length !== cleanedSnippet.length
      ? TRUNCATION_CHAR.length
      : 0;
  const rx = new RegExp(escapeRegExp(withNoEndTruncation));
  const match = rx.exec(body);

  assertDev(Boolean(match), `No match found for "${snippet}" inside "${body}"`);

  const startOfSnippet = match ? match.index : 0;
  const endOfSnippet = startOfSnippet + withNoEndTruncation.length;

  // We want only the ranges that include the snippet
  const filteredBodyRanges = bodyRanges.filter(range => {
    const { start } = range;
    const end = range.start + range.length;
    return end > startOfSnippet && start < endOfSnippet;
  });

  // Adjust ranges, with numbers for the original message body, to work with snippet
  const adjustedBodyRanges: Array<DisplayBodyRangeType> =
    filteredBodyRanges.map(range => {
      const normalizedStart = range.start - startOfSnippet + truncationDelta;
      const start = Math.max(normalizedStart, truncationDelta);
      const end = Math.min(
        normalizedStart + range.length,
        withNoEndTruncation.length + truncationDelta
      );

      return {
        ...range,
        start,
        length: end - start,
      };
    });

  // To format the match identified by FTS, we create a synthetic BodyRange to mix in with
  //   all the other formatting embedded in this message.
  const startOfKeywordMatch = snippet.match(/<<left>>/)?.index;
  const endOfKeywordMatch = snippet.match(/<<right>>/)?.index;

  if (isNumber(startOfKeywordMatch) && isNumber(endOfKeywordMatch)) {
    adjustedBodyRanges.push({
      start:
        startOfKeywordMatch +
        (truncationDelta
          ? TRUNCATION_CHAR.length - TRUNCATION_PLACEHOLDER.length
          : 0),
      length: endOfKeywordMatch - (startOfKeywordMatch + LENGTH_OF_LEFT),
      displayStyle: DisplayStyle.SearchKeywordHighlight,
    });
  }

  return {
    cleanedSnippet: finalSnippet,
    bodyRanges: adjustedBodyRanges,
  };
}
