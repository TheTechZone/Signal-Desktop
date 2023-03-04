// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import type { ReactNode } from 'react';
import emojiRegex from 'emoji-regex';
import { linkify, SUPPORTED_PROTOCOLS } from './Linkify';
import type { HydratedBodyRangeType, RangeNode } from '../../types/BodyRange';
import { BodyRange, insertRange } from '../../types/BodyRange';
import { AtMention } from './AtMention';
import { isLinkSneaky } from '../../types/LinkPreview';
import { Emojify } from './Emojify';
import { AddNewLines } from './AddNewLines';
import type { SizeClassType } from '../emoji/lib';

const EMOJI_REGEXP = emojiRegex();

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

  // put mentions last, so they are fully wrapped by other ranges
  const sortedRanges = [...bodyRanges].sort((a, b) => {
    if (BodyRange.isMention(a)) {
      if (BodyRange.isMention(b)) {
        return 0;
      }
      return 1;
    }
    return -1;
  });

  const rangesTree = sortedRanges.reduce<ReadonlyArray<RangeNode>>(
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
    style: BodyRange.Style;
    innerRanges: ReadonlyArray<RangeNode>;
    key: string;
  }) {
    const inner = process(text, innerRanges);
    switch (style) {
      case BodyRange.Style.BOLD:
        return (
          <span key={key} className="MessageTextRenderer__formatting--bold">
            {inner}
          </span>
        );
      case BodyRange.Style.ITALIC:
        return (
          <span key={key} className="MessageTextRenderer__formatting--italic">
            {inner}
          </span>
        );
      case BodyRange.Style.MONOSPACE:
        return (
          <span
            key={key}
            className="MessageTextRenderer__formatting--monospace"
          >
            {inner}
          </span>
        );
      case BodyRange.Style.STRIKETHROUGH:
        return (
          <span
            key={key}
            className="MessageTextRenderer__formatting--strikethrough"
          >
            {inner}
          </span>
        );
      case BodyRange.Style.SPOILER:
        return (
          <span key={key} className="MessageTextRenderer__formatting--spoiler">
            {inner}
          </span>
        );
      case BodyRange.Style.NONE:
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
      if (BodyRange.isLink(rangeNode)) {
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
      if (BodyRange.isFormatting(rangeNode)) {
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
      if (BodyRange.isMention(rangeNode)) {
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

export function extractLinks(
  messageText: string
): ReadonlyArray<BodyRange<{ url: string }>> {
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
