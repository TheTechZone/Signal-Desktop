// Copyright 2018 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { KeyboardEvent } from 'react';
import React from 'react';

import type { AttachmentType } from '../../types/Attachment';
import { canBeDownloaded } from '../../types/Attachment';
import { getSizeClass } from '../emoji/lib';
import { Emojify } from './Emojify';

import type { ShowConversationType } from '../../state/ducks/conversations';
import type { HydratedBodyRangesType, LocalizerType } from '../../types/Util';
import { MessageTextRenderer } from './MessageTextRenderer';

export type Props = {
  author?: string;
  bodyRanges?: HydratedBodyRangesType;
  direction?: 'incoming' | 'outgoing';
  /** If set, all emoji will be the same size. Otherwise, just one emoji will be large. */
  disableJumbomoji?: boolean;
  /** If set, links will be left alone instead of turned into clickable `<a>` tags. */
  disableLinks?: boolean;
  i18n: LocalizerType;
  kickOffBodyDownload?: () => void;
  onIncreaseTextLength?: () => unknown;
  showConversation?: ShowConversationType;
  text: string;
  textAttachment?: Pick<AttachmentType, 'pending' | 'digest' | 'key'>;
};

/**
 * This component makes it very easy to use all three of our message formatting
 * components: `Emojify`, `Linkify`, and `AddNewLines`. Because each of them is fully
 * configurable with their `renderXXX` props, this component will assemble all three of
 * them for you.
 */
export function MessageBody({
  author,
  bodyRanges,
  direction,
  disableJumbomoji,
  disableLinks,
  i18n,
  kickOffBodyDownload,
  onIncreaseTextLength,
  showConversation,
  text,
  textAttachment,
}: Props): JSX.Element {
  const hasReadMore = Boolean(onIncreaseTextLength);
  const textWithSuffix =
    textAttachment?.pending || hasReadMore ? `${text}...` : text;

  const sizeClass = disableJumbomoji ? undefined : getSizeClass(text);

  let pendingContent: React.ReactNode;
  if (hasReadMore) {
    pendingContent = null;
  } else if (textAttachment?.pending) {
    pendingContent = (
      <span className="MessageBody__highlight"> {i18n('downloading')}</span>
    );
  } else if (
    textAttachment &&
    canBeDownloaded(textAttachment) &&
    kickOffBodyDownload
  ) {
    pendingContent = (
      <span>
        {' '}
        <button
          className="MessageBody__download-body"
          onClick={() => {
            kickOffBodyDownload();
          }}
          onKeyDown={(ev: KeyboardEvent) => {
            if (ev.key === 'Space' || ev.key === 'Enter') {
              kickOffBodyDownload();
            }
          }}
          tabIndex={0}
          type="button"
        >
          {i18n('downloadFullMessage')}
        </button>
      </span>
    );
  }

  return (
    <span>
      {author && (
        <>
          <span className="MessageBody__author">
            <Emojify text={author} sizeClass={sizeClass} />
          </span>
          :{' '}
        </>
      )}

      <MessageTextRenderer
        messageText={textWithSuffix}
        bodyRanges={bodyRanges ?? []}
        direction={direction}
        disableLinks={disableLinks ?? false}
        emojiSizeClass={sizeClass}
        onMentionTrigger={conversationId =>
          showConversation?.({ conversationId })
        }
      />

      {pendingContent}
      {onIncreaseTextLength ? (
        <button
          className="MessageBody__read-more"
          onClick={() => {
            onIncreaseTextLength();
          }}
          onKeyDown={(ev: KeyboardEvent) => {
            if (ev.key === 'Space' || ev.key === 'Enter') {
              onIncreaseTextLength();
            }
          }}
          tabIndex={0}
          type="button"
        >
          {' '}
          {i18n('MessageBody--read-more')}
        </button>
      ) : null}
    </span>
  );
}
