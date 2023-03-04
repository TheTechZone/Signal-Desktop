// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable @typescript-eslint/no-namespace */

import { SignalService as Proto } from '../protobuf';
import * as log from '../logging/log';

// Cold storage of body ranges

export type BodyRange<T extends object> = {
  start: number;
  length: number;
} & T;

/** Body range as parsed from proto (No "Link" since those don't come from proto) */
export type RawBodyRange = BodyRange<BodyRange.Mention | BodyRange.Formatting>;

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
    style: Proto.DataMessage.BodyRange.Style;
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
    return ('mentionUuid' as const satisfies keyof Mention) in bodyRange;
  }
  export function isFormatting(
    bodyRange: BodyRange<object>
  ): bodyRange is BodyRange<Formatting> {
    return ('style' as const satisfies keyof Formatting) in bodyRange;
  }

  export function isLink<T extends Mention | Link | Formatting>(
    node: T
  ): node is T & Link {
    return ('url' as const satisfies keyof Link) in node;
  }
}

// Used exclusive in CompositionArea and related conversation_view.tsx calls.

export type DraftBodyRangeMention = BodyRange<
  BodyRange.Mention & {
    replacementText: string;
  }
>;

export type DraftBodyRangesType = ReadonlyArray<DraftBodyRangeMention>;

// Fully hydrated body range to be used in UI components.

export type HydratedBodyRangeMention = DraftBodyRangeMention & {
  conversationID: string;
};

export type HydratedBodyRangeType =
  | HydratedBodyRangeMention
  | BodyRange<BodyRange.Formatting>;

export type HydratedBodyRangesType = ReadonlyArray<HydratedBodyRangeType>;

type HydratedMention = BodyRange.Mention & {
  conversationID: string;
  replacementText: string;
};

/**
 * A range that can contain other nested ranges
 * Inner range start fields are relative to the start of the containing range
 */
export type RangeNode = BodyRange<
  (HydratedMention | BodyRange.Link | BodyRange.Formatting) & {
    ranges: ReadonlyArray<RangeNode>;
  }
>;

/**
 * Insert a range into an existing range tree, splitting up the range if it intersects
 * with an existing range
 *
 * @param range The range to insert the tree
 * @param rangeTree A list of nested non-intersecting range nodes, these starting ranges
 *  will not be split up
 */
export function insertRange(
  range: BodyRange<HydratedMention | BodyRange.Link | BodyRange.Formatting>,
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
  if (range.start <= current.start && rangeEnd >= currentEnd) {
    return [
      { ...range, length: current.start - range.start, ranges: [] },
      {
        ...current,
        ranges: insertRange(
          { ...range, start: 0, length: current.length },
          current.ranges
        ),
      },
      ...insertRange({ ...range, start: currentEnd }, rest),
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
