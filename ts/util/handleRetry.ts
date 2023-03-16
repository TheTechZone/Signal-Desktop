// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  DecryptionErrorMessage,
  PlaintextContent,
} from '@signalapp/libsignal-client';
import { isNumber } from 'lodash';

import * as Bytes from '../Bytes';
import dataInterface from '../sql/Client';
import { isProduction } from './version';
import { strictAssert } from './assert';
import { isGroupV2 } from './whatTypeOfConversation';
import { isOlderThan } from './timestamp';
import { parseIntOrThrow } from './parseIntOrThrow';
import * as RemoteConfig from '../RemoteConfig';
import { Address } from '../types/Address';
import { QualifiedAddress } from '../types/QualifiedAddress';
import { UUID } from '../types/UUID';
import {
  ToastInternalError,
  ToastInternalErrorKind,
} from '../components/ToastInternalError';
import { showToast } from './showToast';
import * as Errors from '../types/errors';

import type { ConversationModel } from '../models/conversations';
import type {
  DecryptionErrorEvent,
  DecryptionErrorEventData,
  RetryRequestEvent,
  RetryRequestEventData,
} from '../textsecure/messageReceiverEvents';

import { SignalService as Proto } from '../protobuf';
import * as log from '../logging/log';
import type MessageSender from '../textsecure/SendMessage';
import type { StoryDistributionListDataType } from '../state/ducks/storyDistributionLists';
import { drop } from './drop';
import { conversationJobQueue } from '../jobs/conversationJobQueue';

const RETRY_LIMIT = 5;

// Entrypoints

const retryRecord = new Map<number, number>();

export function _getRetryRecord(): Map<number, number> {
  return retryRecord;
}

export async function onRetryRequest(event: RetryRequestEvent): Promise<void> {
  const { confirm, retryRequest } = event;
  const {
    groupId: requestGroupId,
    requesterDevice,
    requesterUuid,
    senderDevice,
    sentAt,
  } = retryRequest;
  const logId = `${requesterUuid}.${requesterDevice} ${sentAt}.${senderDevice}`;

  log.info(`onRetryRequest/${logId}: Starting...`);

  if (!RemoteConfig.isEnabled('desktop.senderKey.retry')) {
    log.warn(
      `onRetryRequest/${logId}: Feature flag disabled, returning early.`
    );
    confirm();
    return;
  }

  const retryCount = (retryRecord.get(sentAt) || 0) + 1;
  retryRecord.set(sentAt, retryCount);
  if (retryCount > RETRY_LIMIT) {
    log.warn(
      `onRetryRequest/${logId}: retryCount is ${retryCount}; returning early.`
    );
    confirm();
    return;
  }

  if (window.RETRY_DELAY) {
    log.warn(`onRetryRequest/${logId}: Delaying because RETRY_DELAY is set...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  let retryRespondMaxAge = 14 * DAY;
  try {
    retryRespondMaxAge = parseIntOrThrow(
      RemoteConfig.getValue('desktop.retryRespondMaxAge'),
      'retryRespondMaxAge'
    );
  } catch (error) {
    log.warn(
      `onRetryRequest/${logId}: Failed to parse integer from desktop.retryRespondMaxAge feature flag`,
      Errors.toLogFormat(error)
    );
  }

  const didArchive = await archiveSessionOnMatch(retryRequest);

  if (isOlderThan(sentAt, retryRespondMaxAge)) {
    log.info(
      `onRetryRequest/${logId}: Message is too old, refusing to send again.`
    );
    await sendDistributionMessageOrNullMessage(logId, retryRequest, didArchive);
    confirm();
    return;
  }

  const sentProto = await window.Signal.Data.getSentProtoByRecipient({
    now: Date.now(),
    recipientUuid: requesterUuid,
    timestamp: sentAt,
  });

  if (!sentProto) {
    log.info(`onRetryRequest/${logId}: Did not find sent proto`);
    await sendDistributionMessageOrNullMessage(logId, retryRequest, didArchive);
    confirm();
    return;
  }

  log.info(`onRetryRequest/${logId}: Resending message`);

  const { messaging } = window.textsecure;
  if (!messaging) {
    throw new Error(`onRetryRequest/${logId}: messaging is not available!`);
  }

  const { contentHint, messageIds, proto, timestamp, urgent } = sentProto;

  // Only applies to sender key sends in groups. See below for story distribution lists.
  const addSenderKeyResult = await maybeAddSenderKeyDistributionMessage({
    contentProto: Proto.Content.decode(proto),
    logId,
    messageIds,
    requestGroupId,
    requesterUuid,
    timestamp,
  });
  // eslint-disable-next-line prefer-destructuring
  let contentProto: Proto.IContent | undefined =
    addSenderKeyResult.contentProto;
  const { groupId } = addSenderKeyResult;

  // Assert that the requesting UUID is still part of a story distribution list that
  //   the message was sent to, and add its sender key distribution message (SKDM).
  if (contentProto.storyMessage && !groupId) {
    contentProto = await checkDistributionListAndAddSKDM({
      confirm,
      contentProto,
      logId,
      messaging,
      requesterUuid,
      timestamp,
    });
    if (!contentProto) {
      return;
    }
  }
  const story = Boolean(contentProto.storyMessage);

  const recipientConversation = window.ConversationController.getOrCreate(
    requesterUuid,
    'private'
  );
  const protoToSend = new Proto.Content(contentProto);

  await conversationJobQueue.add({
    type: 'SavedProto',
    conversationId: recipientConversation.id,
    contentHint,
    groupId,
    protoBase64: Bytes.toBase64(Proto.Content.encode(protoToSend).finish()),
    story,
    timestamp,
    urgent,
  });

  confirm();
  log.info(`onRetryRequest/${logId}: Resend complete.`);
}

function maybeShowDecryptionToast(
  logId: string,
  name: string,
  deviceId: number
) {
  if (isProduction(window.getVersion())) {
    return;
  }

  log.info(`maybeShowDecryptionToast/${logId}: Showing decryption error toast`);
  showToast(ToastInternalError, {
    kind: ToastInternalErrorKind.DecryptionError,
    deviceId,
    name,
    onShowDebugLog: () => window.IPC.showDebugLog(),
  });
}

export async function onDecryptionError(
  event: DecryptionErrorEvent
): Promise<void> {
  const { confirm, decryptionError } = event;
  const { senderUuid, senderDevice, timestamp } = decryptionError;
  const logId = `${senderUuid}.${senderDevice} ${timestamp}`;

  log.info(`onDecryptionError/${logId}: Starting...`);

  const retryCount = (retryRecord.get(timestamp) || 0) + 1;
  retryRecord.set(timestamp, retryCount);
  if (retryCount > RETRY_LIMIT) {
    log.warn(
      `onDecryptionError/${logId}: retryCount is ${retryCount}; returning early.`
    );
    confirm();
    return;
  }

  const conversation = window.ConversationController.getOrCreate(
    senderUuid,
    'private'
  );
  if (!conversation.get('capabilities')?.senderKey) {
    await conversation.getProfiles();
  }

  const name = conversation.getTitle();
  maybeShowDecryptionToast(logId, name, senderDevice);

  if (
    conversation.get('capabilities')?.senderKey &&
    RemoteConfig.isEnabled('desktop.senderKey.retry')
  ) {
    await requestResend(decryptionError);
  } else {
    await startAutomaticSessionReset(decryptionError);
  }

  confirm();
  log.info(`onDecryptionError/${logId}: ...complete`);
}

// Helpers

async function archiveSessionOnMatch({
  ratchetKey,
  requesterUuid,
  requesterDevice,
  senderDevice,
}: RetryRequestEventData): Promise<boolean> {
  const ourDeviceId = parseIntOrThrow(
    window.textsecure.storage.user.getDeviceId(),
    'archiveSessionOnMatch/getDeviceId'
  );
  if (ourDeviceId !== senderDevice || !ratchetKey) {
    return false;
  }

  const ourUuid = window.textsecure.storage.user.getCheckedUuid();
  const address = new QualifiedAddress(
    ourUuid,
    Address.create(requesterUuid, requesterDevice)
  );
  const session = await window.textsecure.storage.protocol.loadSession(address);

  if (session && session.currentRatchetKeyMatches(ratchetKey)) {
    log.info(
      'archiveSessionOnMatch: Matching device and ratchetKey, archiving session'
    );
    await window.textsecure.storage.protocol.archiveSession(address);
    return true;
  }

  return false;
}

async function sendDistributionMessageOrNullMessage(
  logId: string,
  options: RetryRequestEventData,
  didArchive: boolean
): Promise<void> {
  const { groupId, requesterUuid } = options;
  let sentDistributionMessage = false;
  log.info(`sendDistributionMessageOrNullMessage/${logId}: Starting...`);

  const { messaging } = window.textsecure;
  if (!messaging) {
    throw new Error(
      `sendDistributionMessageOrNullMessage/${logId}: messaging is not available!`
    );
  }

  const conversation = window.ConversationController.getOrCreate(
    requesterUuid,
    'private'
  );

  if (groupId) {
    const group = window.ConversationController.get(groupId);
    const distributionId = group?.get('senderKeyInfo')?.distributionId;

    if (group && !group.hasMember(new UUID(requesterUuid))) {
      throw new Error(
        `sendDistributionMessageOrNullMessage/${logId}: Requester ${requesterUuid} is not a member of ${conversation.idForLogging()}`
      );
    }

    if (group && distributionId) {
      log.info(
        `sendDistributionMessageOrNullMessage/${logId}: Found matching group, sending sender key distribution message`
      );

      try {
        await conversationJobQueue.add({
          type: 'SenderKeyDistribution',
          conversationId: conversation.id,
          groupId,
        });
        sentDistributionMessage = true;
      } catch (error) {
        log.error(
          `sendDistributionMessageOrNullMessage/${logId}: Failed to queue sender key distribution message`,
          Errors.toLogFormat(error)
        );
      }
    }
  }

  if (!sentDistributionMessage) {
    if (!didArchive) {
      log.info(
        `sendDistributionMessageOrNullMessage/${logId}: Did't send distribution message and didn't archive session. Returning early.`
      );
      return;
    }

    log.info(
      `sendDistributionMessageOrNullMessage/${logId}: Did not send distribution message, sending null message`
    );

    // Enqueue a null message using the newly-created session
    try {
      await conversationJobQueue.add({
        type: 'NullMessage',
        conversationId: conversation.id,
      });
    } catch (error) {
      log.error(
        'sendDistributionMessageOrNullMessage: Failed to queue null message',
        Errors.toLogFormat(error)
      );
    }
  }
}

async function getRetryConversation({
  logId,
  messageIds,
  requestGroupId,
}: {
  logId: string;
  messageIds: Array<string>;
  requestGroupId?: string;
}): Promise<ConversationModel | undefined> {
  if (messageIds.length !== 1) {
    // Fail over to requested groupId
    return window.ConversationController.get(requestGroupId);
  }

  const [messageId] = messageIds;
  const message = await window.Signal.Data.getMessageById(messageId);
  if (!message) {
    log.warn(
      `getRetryConversation/${logId}: Unable to find message ${messageId}`
    );
    // Fail over to requested groupId
    return window.ConversationController.get(requestGroupId);
  }

  const { conversationId } = message;
  return window.ConversationController.get(conversationId);
}

async function checkDistributionListAndAddSKDM({
  contentProto,
  timestamp,
  confirm,
  logId,
  requesterUuid,
  messaging,
}: {
  contentProto: Proto.IContent;
  timestamp: number;
  confirm: () => void;
  requesterUuid: string;
  logId: string;
  messaging: MessageSender;
}): Promise<Proto.IContent | undefined> {
  let distributionList: StoryDistributionListDataType | undefined;
  const { storyDistributionLists } = window.reduxStore.getState();
  const membersByListId = new Map<string, Set<string>>();
  const listsById = new Map<string, StoryDistributionListDataType>();
  storyDistributionLists.distributionLists.forEach(list => {
    membersByListId.set(list.id, new Set(list.memberUuids));
    listsById.set(list.id, list);
  });

  const messages = await dataInterface.getMessagesBySentAt(timestamp);
  const isInAnyDistributionList = messages.some(message => {
    const listId = message.storyDistributionListId;
    if (!listId) {
      return false;
    }

    const members = membersByListId.get(listId);
    if (!members) {
      return false;
    }

    const isInList = members.has(requesterUuid);

    if (isInList) {
      distributionList = listsById.get(listId);
    }

    return isInList;
  });

  if (!isInAnyDistributionList) {
    log.warn(
      `checkDistributionListAndAddSKDM/${logId}: requesterUuid is not in distribution list. Dropping.`
    );
    confirm();
    return undefined;
  }

  strictAssert(
    distributionList,
    `checkDistributionListAndAddSKDM/${logId}: Should have a distribution list by this point`
  );
  const distributionDetails =
    await window.Signal.Data.getStoryDistributionWithMembers(
      distributionList.id
    );
  const distributionId = distributionDetails?.senderKeyInfo?.distributionId;
  if (!distributionId) {
    log.warn(
      `onRetryRequest/${logId}: No sender key info for distribution list ${distributionList.id}`
    );
    return contentProto;
  }

  const protoWithDistributionMessage =
    await messaging.getSenderKeyDistributionMessage(distributionId, {
      throwIfNotInDatabase: true,
      timestamp,
    });

  return {
    ...contentProto,
    senderKeyDistributionMessage:
      protoWithDistributionMessage.senderKeyDistributionMessage,
  };
}

async function maybeAddSenderKeyDistributionMessage({
  contentProto,
  logId,
  messageIds,
  requestGroupId,
  requesterUuid,
  timestamp,
}: {
  contentProto: Proto.IContent;
  logId: string;
  messageIds: Array<string>;
  requestGroupId?: string;
  requesterUuid: string;
  timestamp: number;
}): Promise<{
  contentProto: Proto.IContent;
  groupId?: string;
}> {
  const conversation = await getRetryConversation({
    logId,
    messageIds,
    requestGroupId,
  });

  const { messaging } = window.textsecure;
  if (!messaging) {
    throw new Error(
      `maybeAddSenderKeyDistributionMessage/${logId}: messaging is not available!`
    );
  }

  if (!conversation) {
    log.warn(
      `maybeAddSenderKeyDistributionMessage/${logId}: Unable to find conversation`
    );
    return {
      contentProto,
    };
  }

  if (!conversation.hasMember(new UUID(requesterUuid))) {
    throw new Error(
      `maybeAddSenderKeyDistributionMessage/${logId}: Recipient ${requesterUuid} is not a member of ${conversation.idForLogging()}`
    );
  }

  if (!isGroupV2(conversation.attributes)) {
    return {
      contentProto,
    };
  }

  const senderKeyInfo = conversation.get('senderKeyInfo');
  if (senderKeyInfo && senderKeyInfo.distributionId) {
    const protoWithDistributionMessage =
      await messaging.getSenderKeyDistributionMessage(
        senderKeyInfo.distributionId,
        { throwIfNotInDatabase: true, timestamp }
      );

    return {
      contentProto: {
        ...contentProto,
        senderKeyDistributionMessage:
          protoWithDistributionMessage.senderKeyDistributionMessage,
      },
      groupId: conversation.get('groupId'),
    };
  }

  return {
    contentProto,
    groupId: conversation.get('groupId'),
  };
}

async function requestResend(decryptionError: DecryptionErrorEventData) {
  const {
    cipherTextBytes,
    cipherTextType,
    contentHint,
    groupId,
    receivedAtCounter,
    receivedAtDate,
    senderDevice,
    senderUuid,
    timestamp,
  } = decryptionError;
  const logId = `${senderUuid}.${senderDevice} ${timestamp}`;

  log.info(`requestResend/${logId}: Starting...`, {
    cipherTextBytesLength: cipherTextBytes?.byteLength,
    cipherTextType,
    contentHint,
    groupId: groupId ? `groupv2(${groupId})` : undefined,
  });

  const { messaging } = window.textsecure;
  if (!messaging) {
    throw new Error(`requestResend/${logId}: messaging is not available!`);
  }

  // 1. Find the target conversation

  const sender = window.ConversationController.getOrCreate(
    senderUuid,
    'private'
  );

  // 2. Prepare resend request

  if (!cipherTextBytes || !isNumber(cipherTextType)) {
    log.warn(
      `requestResend/${logId}: Missing cipherText information, failing over to automatic reset`
    );
    startAutomaticSessionReset(decryptionError);
    return;
  }

  const message = DecryptionErrorMessage.forOriginal(
    Buffer.from(cipherTextBytes),
    cipherTextType,
    timestamp,
    senderDevice
  );

  const plaintext = PlaintextContent.from(message);

  // 3. Queue resend request

  try {
    await conversationJobQueue.add({
      type: 'ResendRequest',
      contentHint,
      conversationId: sender.id,
      groupId,
      plaintext: Bytes.toBase64(plaintext.serialize()),
      receivedAtCounter,
      receivedAtDate,
      senderUuid,
      senderDevice,
      timestamp,
    });
  } catch (error) {
    log.error(
      `requestResend/${logId}: Failed to queue resend request, failing over to automatic reset`,
      Errors.toLogFormat(error)
    );
    startAutomaticSessionReset(decryptionError);
  }
}

function scheduleSessionReset(senderUuid: string, senderDevice: number) {
  // Postpone sending light session resets until the queue is empty
  const { lightSessionResetQueue } = window.Signal.Services;

  if (!lightSessionResetQueue) {
    throw new Error(
      'scheduleSessionReset: lightSessionResetQueue is not available!'
    );
  }

  drop(
    lightSessionResetQueue.add(async () => {
      const ourUuid = window.textsecure.storage.user.getCheckedUuid();

      await window.textsecure.storage.protocol.lightSessionReset(
        new QualifiedAddress(ourUuid, Address.create(senderUuid, senderDevice))
      );
    })
  );
}

export function startAutomaticSessionReset(
  decryptionError: Pick<
    DecryptionErrorEventData,
    'senderUuid' | 'senderDevice' | 'timestamp'
  >
): void {
  const { senderUuid, senderDevice, timestamp } = decryptionError;
  const logId = `${senderUuid}.${senderDevice} ${timestamp}`;

  log.info(`startAutomaticSessionReset/${logId}: Starting...`);

  scheduleSessionReset(senderUuid, senderDevice);

  const conversation = window.ConversationController.lookupOrCreate({
    uuid: senderUuid,
    reason: 'startAutomaticSessionReset',
  });
  if (!conversation) {
    log.warn(
      'startAutomaticSessionReset: No conversation, cannot add message to timeline'
    );
    return;
  }

  const receivedAt = Date.now();
  const receivedAtCounter = window.Signal.Util.incrementMessageCounter();
  drop(
    conversation.queueJob('addChatSessionRefreshed', async () => {
      await conversation.addChatSessionRefreshed({
        receivedAt,
        receivedAtCounter,
      });
    })
  );
}
