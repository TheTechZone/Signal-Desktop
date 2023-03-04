// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable @typescript-eslint/no-namespace */

import React from 'react';
import type { ReactNode } from 'react';
import emojiRegex from 'emoji-regex';
import { linkify, SUPPORTED_PROTOCOLS } from './Linkify';

import type { BodyRangeBase, HydratedBodyRangeType } from '../../types/Util';
import { BodyRange as BodyRangeType } from '../../types/Util';
import { AtMention } from './AtMention';
import { isLinkSneaky } from '../../types/LinkPreview';
import { Emojify } from './Emojify';
import { AddNewLines } from './AddNewLines';
import type { SizeClassType } from '../emoji/lib';
import * as log from '../../logging/log';

const EMOJI_REGEXP = emojiRegex();

type Mention = {
  mentionUuid: string;
  conversationID: string;
  replacementText: string;
};
type Link = {
  url: string;
};
type Formatting = {
  style: BodyRangeType.Style;
};

type BodyRange = BodyRangeBase & (Mention | Link | Formatting);

/**
 * A range that can contain other nested ranges
 * Inner range start fields are relative to the start of the containing range
 */
type RangeNodeBase = BodyRange & {
  ranges: ReadonlyArray<RangeNode>;
};

type RangeNode = RangeNodeBase & (Mention | Link | Formatting);

// eslint-disable-next-line @typescript-eslint/no-redeclare
namespace RangeNode {
  export function isLink<T extends Mention | Link | Formatting>(
    node: T
  ): node is T & Link {
    return ('url' as const satisfies keyof Link) in node;
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

type Props = {
  messageText: string;
  bodyRanges: ReadonlyArray<HydratedBodyRangeType>;
  direction: 'incoming' | 'outgoing' | undefined;
  disableLinks: boolean;
  emojiSizeClass: SizeClassType | undefined;
  onMentionTrigger: (conversationId: string) => void;
};

export function MessageTextRenderer({
  messageText,
  bodyRanges,
  direction,
  disableLinks,
  onMentionTrigger,
}: Props): JSX.Element {
  // get the ranges that cannot be split up first
  const links = disableLinks ? [] : extractLinks(messageText);

  const rangesTree = bodyRanges.reduce<ReadonlyArray<RangeNode>>(
    (acc, range) => insertRange(range, acc),
    links.map(b => ({ ...b, ranges: [] }))
  );

  const processor = createRangeProcessor({
    direction,
    onMentionTrigger,
  });

  return processor.process(messageText, rangesTree);
}

function createRangeProcessor({
  direction,
  onMentionTrigger,
}: {
  direction: 'incoming' | 'outgoing' | undefined;
  onMentionTrigger: ((conversationId: string) => void) | undefined;
}) {
  function renderMention({
    conversationId,
    name,
    key,
  }: {
    conversationId: string;
    name: string;
    key: string;
  }) {
    return (
      <AtMention
        key={key}
        id={conversationId}
        name={name}
        direction={direction}
        onClick={() => {
          if (onMentionTrigger) {
            onMentionTrigger(conversationId);
          }
        }}
        onKeyUp={e => {
          if (
            e.target === e.currentTarget &&
            e.keyCode === 13 &&
            onMentionTrigger
          ) {
            onMentionTrigger(conversationId);
          }
        }}
      />
    );
  }

  function renderLink({
    url,
    text,
    innerRanges,
    key,
  }: {
    url: string;
    text: string;
    innerRanges: ReadonlyArray<RangeNode>;
    key: string;
  }) {
    if (SUPPORTED_PROTOCOLS.test(url) && !isLinkSneaky(url)) {
      return (
        <a key={key} href={url}>
          {process(text, innerRanges)}
        </a>
      );
    }
    return renderText({ text, key });
  }

  function renderFormatting({
    text,
    style,
    innerRanges,
    key,
  }: {
    text: string;
    style: BodyRangeType.Style;
    innerRanges: ReadonlyArray<RangeNode>;
    key: string;
  }) {
    const inner = process(text, innerRanges);
    switch (style) {
      case BodyRangeType.Style.BOLD:
        return (
          <span key={key} className="MessageTextRenderer__formatting--bold">
            {inner}
          </span>
        );
      case BodyRangeType.Style.ITALIC:
        return (
          <span key={key} className="MessageTextRenderer__formatting--italic">
            {inner}
          </span>
        );
      case BodyRangeType.Style.MONOSPACE:
        return (
          <span
            key={key}
            className="MessageTextRenderer__formatting--monospace"
          >
            {inner}
          </span>
        );
      case BodyRangeType.Style.STRIKETHROUGH:
        return (
          <span
            key={key}
            className="MessageTextRenderer__formatting--strikethrough"
          >
            {inner}
          </span>
        );
      case BodyRangeType.Style.SPOILER:
        return (
          <span key={key} className="MessageTextRenderer__formatting--spoiler">
            {inner}
          </span>
        );
      case BodyRangeType.Style.NONE:
        return (
          <span key={key} className="MessageTextRenderer__formatting--none">
            {inner}
          </span>
        );
      default:
        return <span key={key}>{inner}</span>;
    }
  }

  function process(text: string, sortedRangeNodes: ReadonlyArray<RangeNode>) {
    const result: Array<ReactNode> = [];

    let offset = 0;

    for (const rangeNode of sortedRangeNodes) {
      // collect any previous text
      if (rangeNode.start > offset) {
        result.push(
          renderText({
            key: result.length.toString(),
            text: text.slice(offset, rangeNode.start),
          })
        );
      }
      if (RangeNode.isLink(rangeNode)) {
        const rangeText = text.slice(
          rangeNode.start,
          rangeNode.start + rangeNode.length
        );
        result.push(
          renderLink({
            key: result.length.toString(),
            text: rangeText,
            url: rangeNode.url,
            innerRanges: rangeNode.ranges,
          })
        );
      }
      if (RangeNode.isFormatting(rangeNode)) {
        result.push(
          renderFormatting({
            key: result.length.toString(),
            text: text.slice(
              rangeNode.start,
              rangeNode.start + rangeNode.length
            ),
            style: rangeNode.style,
            innerRanges: rangeNode.ranges,
          })
        );
      }
      if (RangeNode.isMention(rangeNode)) {
        result.push(
          renderMention({
            key: result.length.toString(),
            conversationId: rangeNode.conversationID,
            name: rangeNode.replacementText,
          })
        );
      }
      offset = rangeNode.start + rangeNode.length;
    }

    // collect any text after
    result.push(
      renderText({
        key: result.length.toString(),
        text: text.slice(offset, text.length),
      })
    );

    return <>{result}</>;
  }

  return {
    process,
  };
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

  log.error(`MessageTextRenderer: unhandled range ${range}`);
  throw new Error('unhandled range');
}

/** Render text that does not contain body ranges or is in between body ranges */
function renderText({ text, key }: { text: string; key: string }) {
  return (
    <Emojify
      key={key}
      text={text}
      renderNonEmoji={({ text: innerText, key: innerKey }) => (
        <AddNewLines key={innerKey} text={innerText} />
      )}
    />
  );
}

export function extractLinks(messageText: string): ReadonlyArray<BodyRange> {
  // to support emojis immediately before links
  // we replace emojis with a space for each byte
  const matches = linkify.match(
    messageText.replace(EMOJI_REGEXP, s => ' '.repeat(s.length))
  );

  if (matches == null) {
    return [];
  }

  return matches.map(match => {
    return {
      start: match.index,
      length: match.lastIndex - match.index,
      url: match.url,
    };
  });
}
