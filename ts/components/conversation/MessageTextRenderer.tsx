/* eslint-disable @typescript-eslint/no-namespace */

import type { ReactFragment } from 'react';
import React from 'react';
import { noop } from 'lodash';
import { linkify } from './Linkify';

import type { HydratedBodyRangeType } from '../../types/Util';
import { BodyRange as BodyRangeType } from '../../types/Util';
import { AtMention } from './AtMention';

type BodyRangeBase = {
  start: number;
  length: number;
};

type Mention = {
  mentionUuid: string;
  conversationID: string;
  replacementText: string;
};
type Link = {
  href: string;
};
type Formatting = {
  style: BodyRangeType.Style;
};

type BodyRange = BodyRangeBase & (Mention | Link | Formatting);

type RangeNodeBase = BodyRange & {
  ranges: ReadonlyArray<RangeNode>;
};

type RangeNode = RangeNodeBase & (Mention | Link | Formatting);

// eslint-disable-next-line @typescript-eslint/no-redeclare
namespace RangeNode {
  export function isLink<T extends Mention | Link | Formatting>(
    node: T
  ): node is T & Link {
    return ('href' as const satisfies keyof Link) in node;
  }

  export function isFormatting<T extends Mention | Link | Formatting>(
    node: T
  ): node is T & Formatting {
    return ('style' as const satisfies keyof Formatting) in node;
  }

  export function isMention<T extends Mention | Link | Formatting>(
    node: T
  ): node is T & Mention {
    return ('mentionUuid' as const satisfies keyof Mention) in node;
  }
}

/**
 * Insert a range into an existing range tree, splitting up the range if it intersects
 * with an existing range
 *
 * @param range The range to insert the tree
 * @param rangeTree A list of nested non-intersecting range nodes, these starting ranges
 *  will not be split up
 */
function insertRange(
  range: BodyRange,
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
      ...insertRange({ ...range, start: currentEnd }, rest),
    ];
  }

  throw new Error('wtf');
}

function applyRangeNodes(
  text: string,
  sortedRangeNodes: ReadonlyArray<RangeNode>,
  direction: 'incoming' | 'outgoing' | undefined
): JSX.Element {
  const result: Array<ReactFragment> = [];

  let offset = 0;

  for (const rangeNode of sortedRangeNodes) {
    // collect any previous text
    if (rangeNode.start > offset) {
      result.push(<>{text.slice(offset, rangeNode.start)}</>);
    }
    if (RangeNode.isLink(rangeNode)) {
      result.push(
        <a href={rangeNode.href}>
          {applyRangeNodes(
            text.slice(rangeNode.start, rangeNode.start + rangeNode.length),
            rangeNode.ranges,
            direction
          )}
        </a>
      );
    }
    if (RangeNode.isFormatting(rangeNode)) {
      const inner = applyRangeNodes(
        text.slice(rangeNode.start, rangeNode.start + rangeNode.length),
        rangeNode.ranges,
        direction
      );
      let element: JSX.Element = <>{inner}</>;
      if (rangeNode.style === BodyRangeType.Style.BOLD) {
        element = <span className="formatting--bold">{inner}</span>;
      }
      if (rangeNode.style === BodyRangeType.Style.ITALIC) {
        element = <span className="formatting--italic">{inner}</span>;
      }
      if (rangeNode.style === BodyRangeType.Style.MONOSPACE) {
        element = <span className="formatting--monospace">{inner}</span>;
      }
      if (rangeNode.style === BodyRangeType.Style.STRIKETHROUGH) {
        element = <span className="formatting--strikethrough">{inner}</span>;
      }
      if (rangeNode.style === BodyRangeType.Style.SPOILER) {
        element = <span className="formatting--spoiler">{inner}</span>;
      }
      if (element !== undefined) {
        result.push(element);
      }
    }
    if (RangeNode.isMention(rangeNode)) {
      result.push(
        <AtMention
          id={rangeNode.conversationID}
          name={rangeNode.replacementText}
          direction={direction}
          onClick={noop}
          onKeyUp={noop}
        />
      );
    }
    offset = rangeNode.start + rangeNode.length;
  }

  result.push(text.slice(offset, text.length));

  return <>{result}</>;
}

export function extractLinks(messageText: string): ReadonlyArray<BodyRange> {
  const matches = linkify.match(messageText);

  if (matches == null) {
    return [];
  }

  return matches.map(match => {
    return {
      start: match.index,
      length: match.lastIndex - match.index,
      href: match.url,
    };
  });
}

type Props = {
  messageText: string;
  bodyRanges: ReadonlyArray<HydratedBodyRangeType>;
  direction: 'incoming' | 'outgoing' | undefined;
};

export function MessageTextRenderer({
  messageText,
  bodyRanges,
  direction,
}: Props): JSX.Element {
  // get the ranges that cannot be split up first
  const rangesTree = bodyRanges.reduce<ReadonlyArray<RangeNode>>(
    (acc, range) => insertRange(range, acc),
    []
  );

  return applyRangeNodes(messageText, rangesTree, direction);
}
