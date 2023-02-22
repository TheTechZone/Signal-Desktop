// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { isNumber } from 'lodash';

import * as Errors from '../../types/errors';
import { strictAssert } from '../../util/assert';
import type { MessageModel } from '../../models/messages';
import { getMessageById } from '../../messages/getMessageById';
import type { ConversationModel } from '../../models/conversations';
import { isGroup, isGroupV2, isMe } from '../../util/whatTypeOfConversation';
import { getSendOptions } from '../../util/getSendOptions';
import { SignalService as Proto } from '../../protobuf';
import { handleMessageSend } from '../../util/handleMessageSend';
import { findAndFormatContact } from '../../util/findAndFormatContact';
import type { CallbackResultType } from '../../textsecure/Types.d';
import { isSent } from '../../messages/MessageSendState';
import { isOutgoing, canReact } from '../../state/selectors/message';
import type {
  AttachmentType,
  ContactWithHydratedAvatar,
  ReactionType,
} from '../../textsecure/SendMessage';
import type { LinkPreviewType } from '../../types/message/LinkPreviews';
import { BodyRange, BodyRangeMention, /*BodyRangesType, */StoryContextType } from '../../types/Util';
import type { LoggerType } from '../../types/Logging';
import type { StickerWithHydratedData } from '../../types/Stickers';
import type { QuotedMessageType } from '../../model-types.d';
import type {
  ConversationQueueJobBundle,
  NormalMessageSendJobData,
} from '../conversationJobQueue';

import { handleMultipleSendErrors } from './handleMultipleSendErrors';
import { ourProfileKeyService } from '../../services/ourProfileKey';
import { isConversationUnregistered } from '../../util/isConversationUnregistered';
import { isConversationAccepted } from '../../util/isConversationAccepted';
import { sendToGroup } from '../../util/sendToGroup';
import type { DurationInSeconds } from '../../util/durations';
import type { UUIDStringType } from '../../types/UUID';

export async function sendNormalMessage(
  conversation: ConversationModel,
  {
    isFinalAttempt,
    messaging,
    shouldContinue,
    timeRemaining,
    log,
  }: ConversationQueueJobBundle,
  data: NormalMessageSendJobData
): Promise<void> {
  const { Message } = window.Signal.Types;

  const { messageId, revision } = data;
  const message = await getMessageById(messageId);
  if (!message) {
    log.info(
      `message ${messageId} was not found, maybe because it was deleted. Giving up on sending it`
    );
    return;
  }

  const messageConversation = message.getConversation();
  if (messageConversation !== conversation) {
    log.error(
      `Message conversation '${messageConversation?.idForLogging()}' does not match job conversation ${conversation.idForLogging()}`
    );
    return;
  }

  if (!isOutgoing(message.attributes)) {
    log.error(
      `message ${messageId} was not an outgoing message to begin with. This is probably a bogus job. Giving up on sending it`
    );
    return;
  }

  if (message.isErased() || message.get('deletedForEveryone')) {
    log.info(`message ${messageId} was erased. Giving up on sending it`);
    return;
  }

  let messageSendErrors: Array<Error> = [];

  // We don't want to save errors on messages unless we're giving up. If it's our
  //   final attempt, we know upfront that we want to give up. However, we might also
  //   want to give up if (1) we get a 508 from the server, asking us to please stop
  //   (2) we get a 428 from the server, flagging the message for spam (3) some other
  //   reason not known at the time of this writing.
  //
  // This awkward callback lets us hold onto errors we might want to save, so we can
  //   decide whether to save them later on.
  const saveErrors = isFinalAttempt
    ? undefined
    : (errors: Array<Error>) => {
        messageSendErrors = errors;
      };

  if (!shouldContinue) {
    log.info(`message ${messageId} ran out of time. Giving up on sending it`);
    await markMessageFailed(message, [
      new Error('Message send ran out of time'),
    ]);
    return;
  }

  let profileKey: Uint8Array | undefined;
  if (conversation.get('profileSharing')) {
    profileKey = await ourProfileKeyService.get();
  }

  let originalError: Error | undefined;

  try {
    const {
      allRecipientIdentifiers,
      recipientIdentifiersWithoutMe,
      sentRecipientIdentifiers,
      untrustedUuids,
    } = getMessageRecipients({
      log,
      message,
      conversation,
    });

    if (untrustedUuids.length) {
      window.reduxActions.conversations.conversationStoppedByMissingVerification(
        {
          conversationId: conversation.id,
          untrustedUuids,
        }
      );
      throw new Error(
        `Message ${messageId} sending blocked because ${untrustedUuids.length} conversation(s) were untrusted. Failing this attempt.`
      );
    }

    if (!allRecipientIdentifiers.length) {
      log.warn(
        `trying to send message ${messageId} but it looks like it was already sent to everyone. This is unexpected, but we're giving up`
      );
      return;
    }

    const {
      attachments,
      body,
      contact,
      deletedForEveryoneTimestamp,
      expireTimer,
      mentions,
      messageTimestamp,
      preview,
      quote,
      sticker,
      storyMessage,
      storyContext,
      reaction,
    } = await getMessageSendData({ log, message });

    if (reaction) {
      strictAssert(
        storyMessage,
        'Only story reactions can be sent as normal messages'
      );

      const ourConversationId =
        window.ConversationController.getOurConversationIdOrThrow();

      if (
        !canReact(
          storyMessage.attributes,
          ourConversationId,
          findAndFormatContact
        )
      ) {
        log.info(
          `could not react to ${messageId}. Removing this pending reaction`
        );
        await markMessageFailed(message, [
          new Error('Could not react to story'),
        ]);
        return;
      }
    }

    let messageSendPromise: Promise<CallbackResultType | void>;

    if (recipientIdentifiersWithoutMe.length === 0) {
      if (
        !isMe(conversation.attributes) &&
        !isGroup(conversation.attributes) &&
        sentRecipientIdentifiers.length === 0
      ) {
        log.info(
          'No recipients; not sending to ourselves or to group, and no successful sends. Failing job.'
        );
        void markMessageFailed(message, [new Error('No valid recipients')]);
        return;
      }

      // We're sending to Note to Self or a 'lonely group' with just us in it
      // or sending a story to a group where all other users don't have the stories
      // capabilities (effectively a 'lonely group' in the context of stories)
      log.info('sending sync message only');
      const dataMessage = await messaging.getDataMessage({
        attachments,
        body,
        contact,
        deletedForEveryoneTimestamp,
        expireTimer,
        groupV2: conversation.getGroupV2Info({
          members: recipientIdentifiersWithoutMe,
        }),
        preview,
        profileKey,
        quote,
        recipients: allRecipientIdentifiers,
        sticker,
        storyContext,
        timestamp: messageTimestamp,
        reaction,
      });
      messageSendPromise = message.sendSyncMessageOnly(dataMessage, saveErrors);
    } else {
      const conversationType = conversation.get('type');
      const sendOptions = await getSendOptions(conversation.attributes);
      const { ContentHint } = Proto.UnidentifiedSenderMessage.Message;

      let innerPromise: Promise<CallbackResultType>;
      if (conversationType === Message.GROUP) {
        // Note: this will happen for all old jobs queued beore 5.32.x
        if (isGroupV2(conversation.attributes) && !isNumber(revision)) {
          log.error('No revision provided, but conversation is GroupV2');
        }

        const groupV2Info = conversation.getGroupV2Info({
          members: recipientIdentifiersWithoutMe,
        });
        if (groupV2Info && isNumber(revision)) {
          groupV2Info.revision = revision;
        }

        log.info('sending group message');
        innerPromise = conversation.queueJob(
          'conversationQueue/sendNormalMessage',
          abortSignal =>
            sendToGroup({
              abortSignal,
              contentHint: ContentHint.RESENDABLE,
              groupSendOptions: {
                attachments,
                contact,
                deletedForEveryoneTimestamp,
                expireTimer,
                groupV1: conversation.getGroupV1Info(
                  recipientIdentifiersWithoutMe
                ),
                groupV2: groupV2Info,
                messageText: body,
                preview,
                profileKey,
                quote,
                sticker,
                storyContext,
                reaction,
                timestamp: messageTimestamp,
                mentions,
              },
              messageId,
              sendOptions,
              sendTarget: conversation.toSenderKeyTarget(),
              sendType: 'message',
              story: Boolean(storyContext),
              urgent: true,
            })
        );
      } else {
        if (!isConversationAccepted(conversation.attributes)) {
          log.info(
            `conversation ${conversation.idForLogging()} is not accepted; refusing to send`
          );
          void markMessageFailed(message, [
            new Error('Message request was not accepted'),
          ]);
          return;
        }
        if (isConversationUnregistered(conversation.attributes)) {
          log.info(
            `conversation ${conversation.idForLogging()} is unregistered; refusing to send`
          );
          void markMessageFailed(message, [
            new Error('Contact no longer has a Signal account'),
          ]);
          return;
        }
        if (conversation.isBlocked()) {
          log.info(
            `conversation ${conversation.idForLogging()} is blocked; refusing to send`
          );
          void markMessageFailed(message, [new Error('Contact is blocked')]);
          return;
        }

        log.info('sending direct message');
        innerPromise = messaging.sendMessageToIdentifier({
          attachments,
          contact,
          contentHint: ContentHint.RESENDABLE,
          deletedForEveryoneTimestamp,
          expireTimer,
          groupId: undefined,
          identifier: recipientIdentifiersWithoutMe[0],
          messageText: body,
          options: sendOptions,
          preview,
          profileKey,
          quote,
          sticker,
          storyContext,
          reaction,
          timestamp: messageTimestamp,
          // Note: 1:1 story replies should not set story=true -   they aren't group sends
          urgent: true,
          includePniSignatureMessage: true,
        });
      }

      messageSendPromise = message.send(
        handleMessageSend(innerPromise, {
          messageIds: [messageId],
          sendType: 'message',
        }),
        saveErrors
      );

      // Because message.send swallows and processes errors, we'll await the inner promise
      //   to get the SendMessageProtoError, which gives us information upstream
      //   processors need to detect certain kinds of situations.
      try {
        await innerPromise;
      } catch (error) {
        if (error instanceof Error) {
          originalError = error;
        } else {
          log.error(
            `promiseForError threw something other than an error: ${Errors.toLogFormat(
              error
            )}`
          );
        }
      }
    }

    await messageSendPromise;

    const didFullySend =
      !messageSendErrors.length || didSendToEveryone(message);
    if (!didFullySend) {
      throw new Error('message did not fully send');
    }
  } catch (thrownError: unknown) {
    const errors = [thrownError, ...messageSendErrors];
    await handleMultipleSendErrors({
      errors,
      isFinalAttempt,
      log,
      markFailed: () => markMessageFailed(message, messageSendErrors),
      timeRemaining,
      // In the case of a failed group send thrownError will not be SentMessageProtoError,
      //   but we should have been able to harvest the original error. In the Note to Self
      //   send case, thrownError will be the error we care about, and we won't have an
      //   originalError.
      toThrow: originalError || thrownError,
    });
  }
}

function getMessageRecipients({
  log,
  conversation,
  message,
}: Readonly<{
  log: LoggerType;
  conversation: ConversationModel;
  message: MessageModel;
}>): {
  allRecipientIdentifiers: Array<string>;
  recipientIdentifiersWithoutMe: Array<string>;
  sentRecipientIdentifiers: Array<string>;
  untrustedUuids: Array<UUIDStringType>;
} {
  const allRecipientIdentifiers: Array<string> = [];
  const recipientIdentifiersWithoutMe: Array<string> = [];
  const untrustedUuids: Array<UUIDStringType> = [];
  const sentRecipientIdentifiers: Array<string> = [];

  const currentConversationRecipients = conversation.getMemberConversationIds();

  Object.entries(message.get('sendStateByConversationId') || {}).forEach(
    ([recipientConversationId, sendState]) => {
      const recipient = window.ConversationController.get(
        recipientConversationId
      );
      if (!recipient) {
        return;
      }

      const isRecipientMe = isMe(recipient.attributes);

      if (
        !currentConversationRecipients.has(recipientConversationId) &&
        !isRecipientMe
      ) {
        return;
      }

      if (recipient.isUntrusted()) {
        const uuid = recipient.get('uuid');
        if (!uuid) {
          log.error(
            `sendNormalMessage/getMessageRecipients: Untrusted conversation ${recipient.idForLogging()} missing UUID.`
          );
          return;
        }
        untrustedUuids.push(uuid);
        return;
      }
      if (recipient.isUnregistered()) {
        return;
      }
      if (recipient.isBlocked()) {
        return;
      }

      const recipientIdentifier = recipient.getSendTarget();
      if (!recipientIdentifier) {
        return;
      }

      if (isSent(sendState.status)) {
        sentRecipientIdentifiers.push(recipientIdentifier);
        return;
      }

      allRecipientIdentifiers.push(recipientIdentifier);
      if (!isRecipientMe) {
        recipientIdentifiersWithoutMe.push(recipientIdentifier);
      }
    }
  );

  return {
    allRecipientIdentifiers,
    recipientIdentifiersWithoutMe,
    sentRecipientIdentifiers,
    untrustedUuids,
  };
}

async function getMessageSendData({
  log,
  message,
}: Readonly<{
  log: LoggerType;
  message: MessageModel;
}>): Promise<{
  attachments: Array<AttachmentType>;
  body: undefined | string;
  contact?: Array<ContactWithHydratedAvatar>;
  deletedForEveryoneTimestamp: undefined | number;
  expireTimer: undefined | DurationInSeconds;
  // mentions: undefined | BodyRangesType;
  mentions: undefined | ReadonlyArray<BodyRangeMention>;
  messageTimestamp: number;
  preview: Array<LinkPreviewType>;
  quote: QuotedMessageType | null;
  sticker: StickerWithHydratedData | undefined;
  reaction: ReactionType | undefined;
  storyMessage?: MessageModel;
  storyContext?: StoryContextType;
}> {
  const {
    loadAttachmentData,
    loadContactData,
    loadPreviewData,
    loadQuoteData,
    loadStickerData,
  } = window.Signal.Migrations;

  let messageTimestamp: number;
  const sentAt = message.get('sent_at');
  const timestamp = message.get('timestamp');
  if (sentAt) {
    messageTimestamp = sentAt;
  } else if (timestamp) {
    log.error('message lacked sent_at. Falling back to timestamp');
    messageTimestamp = timestamp;
  } else {
    log.error(
      'message lacked sent_at and timestamp. Falling back to current time'
    );
    messageTimestamp = Date.now();
  }

  const storyId = message.get('storyId');

  const [attachmentsWithData, contact, preview, quote, sticker, storyMessage] =
    await Promise.all([
      // We don't update the caches here because (1) we expect the caches to be populated
      //   on initial send, so they should be there in the 99% case (2) if you're retrying
      //   a failed message across restarts, we don't touch the cache for simplicity. If
      //   sends are failing, let's not add the complication of a cache.
      Promise.all((message.get('attachments') ?? []).map(loadAttachmentData)),
      message.cachedOutgoingContactData ||
        loadContactData(message.get('contact')),
      message.cachedOutgoingPreviewData ||
        loadPreviewData(message.get('preview')),
      message.cachedOutgoingQuoteData || loadQuoteData(message.get('quote')),
      message.cachedOutgoingStickerData ||
        loadStickerData(message.get('sticker')),
      storyId ? getMessageById(storyId) : undefined,
    ]);

  const { body, attachments } = window.Whisper.Message.getLongMessageAttachment(
    {
      body: message.get('body'),
      attachments: attachmentsWithData,
      now: messageTimestamp,
    }
  );

  const storyReaction = message.get('storyReaction');

  return {
    attachments,
    body,
    contact,
    deletedForEveryoneTimestamp: message.get('deletedForEveryoneTimestamp'),
    expireTimer: message.get('expireTimer'),
    mentions: message.get('bodyRanges')?.filter(BodyRange.isMention),
    messageTimestamp,
    preview,
    quote,
    sticker,
    storyMessage,
    storyContext: storyMessage
      ? {
          authorUuid: storyMessage.get('sourceUuid'),
          timestamp: storyMessage.get('sent_at'),
        }
      : undefined,
    reaction: storyReaction
      ? {
          ...storyReaction,
          remove: false,
        }
      : undefined,
  };
}

async function markMessageFailed(
  message: MessageModel,
  errors: Array<Error>
): Promise<void> {
  message.markFailed();
  void message.saveErrors(errors, { skipSave: true });
  await window.Signal.Data.saveMessage(message.attributes, {
    ourUuid: window.textsecure.storage.user.getCheckedUuid().toString(),
  });
}

function didSendToEveryone(message: Readonly<MessageModel>): boolean {
  const sendStateByConversationId =
    message.get('sendStateByConversationId') || {};
  return Object.values(sendStateByConversationId).every(sendState =>
    isSent(sendState.status)
  );
}
