// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import type { ReactNode } from 'react';
import emojiRegex from 'emoji-regex';
import { linkify, SUPPORTED_PROTOCOLS } from './Linkify';
import type {
  BodyRangesForDisplayType,
  RangeNode,
} from '../../types/BodyRange';
import {
  BodyRange,
  DisplayStyle,
  insertRange,
  sortRanges,
} from '../../types/BodyRange';
import { AtMention } from './AtMention';
import { isLinkSneaky } from '../../types/LinkPreview';
import { Emojify } from './Emojify';
import { AddNewLines } from './AddNewLines';
import type { SizeClassType } from '../emoji/lib';
import * as log from '../../logging/log';

const EMOJI_REGEXP = emojiRegex();

type Props = {
  messageText: string;
  bodyRanges: BodyRangesForDisplayType;
  direction: 'incoming' | 'outgoing' | undefined;
  disableClickableMentions: boolean;
  disableLinks: boolean;
  emojiSizeClass: SizeClassType | undefined;
  onMentionTrigger: (conversationId: string) => void;
};

export function MessageTextRenderer({
  messageText,
  bodyRanges,
  direction,
  disableClickableMentions,
  disableLinks,
  emojiSizeClass,
  onMentionTrigger,
}: Props): JSX.Element {
  // get the ranges that cannot be split up first
  const links = disableLinks ? [] : extractLinks(messageText);
  const sortedRanges = sortRanges([...bodyRanges]);
  const rangesTree = sortedRanges.reduce<ReadonlyArray<RangeNode>>(
    (acc, range) => insertRange(range, acc),
    links.map(b => ({ ...b, ranges: [] }))
  );

  const processor = createRangeProcessor({
    direction,
    disableClickableMentions,
    emojiSizeClass,
    onMentionTrigger,
  });

  return processor.process(messageText, rangesTree);
}

function createRangeProcessor({
  direction,
  disableClickableMentions,
  emojiSizeClass,
  onMentionTrigger,
}: {
  direction: 'incoming' | 'outgoing' | undefined;
  disableClickableMentions: boolean;
  emojiSizeClass: SizeClassType | undefined;
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
    if (disableClickableMentions) {
      return (
        <bdi key={key}>
          @
          <Emojify text={name} />
        </bdi>
      );
    }

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
            e.key === 'Enter' &&
            onMentionTrigger
          ) {
            onMentionTrigger(conversationId);
          }
        }}
      />
    );
  }

  function renderLink({
    innerRanges,
    key,
    text,
    url,
  }: {
    innerRanges: ReadonlyArray<RangeNode>;
    key: string;
    text: string;
    url: string;
  }) {
    if (SUPPORTED_PROTOCOLS.test(url) && !isLinkSneaky(url)) {
      return (
        <a key={key} href={url}>
          {process(text, innerRanges)}
        </a>
      );
    }
    return renderText({ text, emojiSizeClass, key });
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
      default: {
        const unexpected: never = style;
        log.warn(`renderFormatting: unexpected style ${unexpected}`);
        return <span key={key}>{inner}</span>;
      }
    }
  }
  function renderDisplayOnly({
    text,
    displayStyle,
    innerRanges,
    key,
  }: {
    text: string;
    displayStyle: DisplayStyle;
    innerRanges: ReadonlyArray<RangeNode>;
    key: string;
  }) {
    const inner = process(text, innerRanges);
    switch (displayStyle) {
      case DisplayStyle.SearchKeywordHighlight:
        return (
          <span
            key={key}
            className="MessageTextRenderer__formatting--keywordHighlight"
          >
            {inner}
          </span>
        );
      default: {
        const unexpected: never = displayStyle;
        log.warn(`renderDisplayOnly: unexpected displayStyle ${unexpected}`);
        return <span key={key}>{inner}</span>;
      }
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
            emojiSizeClass,
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
      if (BodyRange.isDisplayOnly(rangeNode)) {
        result.push(
          renderDisplayOnly({
            key: result.length.toString(),
            text: text.slice(
              rangeNode.start,
              rangeNode.start + rangeNode.length
            ),
            displayStyle: rangeNode.displayStyle,
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
        emojiSizeClass,
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
function renderText({
  text,
  emojiSizeClass,
  key,
}: {
  text: string;
  emojiSizeClass: SizeClassType | undefined;
  key: string;
}) {
  return (
    <Emojify
      key={key}
      text={text}
      sizeClass={emojiSizeClass}
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
