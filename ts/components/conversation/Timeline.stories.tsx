// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import { times } from 'lodash';
import { v4 as uuid } from 'uuid';
import { text, boolean, number } from '@storybook/addon-knobs';
import { action } from '@storybook/addon-actions';

import { setupI18n } from '../../util/setupI18n';
import { DurationInSeconds } from '../../util/durations';
import enMessages from '../../../_locales/en/messages.json';
import type { PropsType } from './Timeline';
import { Timeline } from './Timeline';
import type { TimelineItemType } from './TimelineItem';
import { TimelineItem } from './TimelineItem';
import { ContactSpoofingReviewDialog } from './ContactSpoofingReviewDialog';
import { StorybookThemeContext } from '../../../.storybook/StorybookThemeContext';
import { ConversationHero } from './ConversationHero';
import type { PropsType as SmartContactSpoofingReviewDialogPropsType } from '../../state/smart/ContactSpoofingReviewDialog';
import { getDefaultConversation } from '../../test-both/helpers/getDefaultConversation';
import { getRandomColor } from '../../test-both/helpers/getRandomColor';
import { TypingBubble } from './TypingBubble';
import { ContactSpoofingType } from '../../util/contactSpoofing';
import { ReadStatus } from '../../messages/MessageReadStatus';
import type { WidthBreakpoint } from '../_util';
import { ThemeType } from '../../types/Util';
import { TextDirection } from './Message';
import { PaymentEventKind } from '../../types/Payment';
import type { PropsData as TimelineMessageProps } from './TimelineMessage';

const i18n = setupI18n('en', enMessages);

export default {
  title: 'Components/Conversation/Timeline',
};

// eslint-disable-next-line
const noop = () => {};

function mockMessageTimelineItem(
  id: string,
  data: Partial<TimelineMessageProps>
): TimelineItemType {
  return {
    type: 'message',
    data: {
      id,
      author: getDefaultConversation({}),
      canDeleteForEveryone: false,
      canDownload: true,
      canReact: true,
      canReply: true,
      canRetry: true,
      conversationId: 'conversation-id',
      conversationTitle: 'Conversation Title',
      conversationType: 'group',
      conversationColor: 'crimson',
      direction: 'incoming',
      status: 'sent',
      text: 'Hello there from the new world!',
      isBlocked: false,
      isMessageRequestAccepted: true,
      isSelected: false,
      isSelectMode: false,
      previews: [],
      readStatus: ReadStatus.Read,
      canRetryDeleteForEveryone: true,
      textDirection: TextDirection.Default,
      timestamp: Date.now(),
      ...data,
    },
    timestamp: Date.now(),
  };
}

const items: Record<string, TimelineItemType> = {
  'id-1': mockMessageTimelineItem('id-1', {
    author: getDefaultConversation({
      phoneNumber: '(202) 555-2001',
    }),
    conversationColor: 'forest',
    text: '🔥',
  }),
  'id-2': mockMessageTimelineItem('id-2', {
    conversationColor: 'forest',
    direction: 'incoming',
    text: 'Hello there from the new world! http://somewhere.com',
  }),
  'id-2.5': {
    type: 'unsupportedMessage',
    data: {
      canProcessNow: false,
      contact: {
        id: '061d3783-5736-4145-b1a2-6b6cf1156393',
        isMe: false,
        phoneNumber: '(202) 555-1000',
        profileName: 'Mr. Pig',
        title: 'Mr. Pig',
      },
    },
    timestamp: Date.now(),
  },
  'id-3': mockMessageTimelineItem('id-3', {}),
  'id-4': {
    type: 'timerNotification',
    data: {
      disabled: false,
      expireTimer: DurationInSeconds.fromHours(2),
      title: "It's Me",
      type: 'fromMe',
    },
    timestamp: Date.now(),
  },
  'id-5': {
    type: 'timerNotification',
    data: {
      disabled: false,
      expireTimer: DurationInSeconds.fromHours(2),
      title: '(202) 555-0000',
      type: 'fromOther',
    },
    timestamp: Date.now(),
  },
  'id-6': {
    type: 'safetyNumberNotification',
    data: {
      contact: {
        id: '+1202555000',
        title: 'Mr. Fire',
      },
      isGroup: true,
    },
    timestamp: Date.now(),
  },
  'id-7': {
    type: 'verificationNotification',
    data: {
      contact: { title: 'Mrs. Ice' },
      isLocal: true,
      type: 'markVerified',
    },
    timestamp: Date.now(),
  },
  'id-8': {
    type: 'groupNotification',
    data: {
      changes: [
        {
          type: 'name',
          newName: 'Squirrels and their uses',
        },
        {
          type: 'add',
          contacts: [
            getDefaultConversation({
              phoneNumber: '(202) 555-0002',
              title: 'Mr. Fire',
            }),
            getDefaultConversation({
              phoneNumber: '(202) 555-0003',
              title: 'Ms. Water',
            }),
          ],
        },
      ],
      from: getDefaultConversation({
        phoneNumber: '(202) 555-0001',
        title: 'Mrs. Ice',
        isMe: false,
      }),
    },
    timestamp: Date.now(),
  },
  'id-9': {
    type: 'resetSessionNotification',
    data: null,
    timestamp: Date.now(),
  },
  'id-10': mockMessageTimelineItem('id-10', {
    conversationColor: 'plum',
    direction: 'outgoing',
    text: '🔥',
  }),
  'id-11': mockMessageTimelineItem('id-11', {
    direction: 'outgoing',
    status: 'read',
    text: 'Hello there from the new world! http://somewhere.com',
  }),
  'id-12': mockMessageTimelineItem('id-12', {
    direction: 'outgoing',
    text: 'Hello there from the new world! 🔥',
  }),
  'id-13': mockMessageTimelineItem('id-13', {
    direction: 'outgoing',
    text: 'Hello there from the new world! And this is multiple lines of text. Lines and lines and lines.',
  }),
  'id-14': mockMessageTimelineItem('id-14', {
    direction: 'outgoing',
    status: 'read',
    text: 'Hello there from the new world! And this is multiple lines of text. Lines and lines and lines.',
  }),
  'id-15': {
    type: 'paymentEvent',
    data: {
      event: {
        kind: PaymentEventKind.ActivationRequest,
      },
      sender: getDefaultConversation(),
      conversation: getDefaultConversation(),
    },
    timestamp: Date.now(),
  },
  'id-16': {
    type: 'paymentEvent',
    data: {
      event: {
        kind: PaymentEventKind.Activation,
      },
      sender: getDefaultConversation(),
      conversation: getDefaultConversation(),
    },
    timestamp: Date.now(),
  },
  'id-17': {
    type: 'paymentEvent',
    data: {
      event: {
        kind: PaymentEventKind.ActivationRequest,
      },
      sender: getDefaultConversation({
        isMe: true,
      }),
      conversation: getDefaultConversation(),
    },
    timestamp: Date.now(),
  },
  'id-18': {
    type: 'paymentEvent',
    data: {
      event: {
        kind: PaymentEventKind.Activation,
      },
      sender: getDefaultConversation({
        isMe: true,
      }),
      conversation: getDefaultConversation(),
    },
    timestamp: Date.now(),
  },
  'id-19': mockMessageTimelineItem('id-19', {
    direction: 'outgoing',
    status: 'read',
    payment: {
      kind: PaymentEventKind.Notification,
      note: 'Thanks',
    },
  }),
};

const actions = () => ({
  acknowledgeGroupMemberNameCollisions: action(
    'acknowledgeGroupMemberNameCollisions'
  ),
  blockGroupLinkRequests: action('blockGroupLinkRequests'),
  checkForAccount: action('checkForAccount'),
  clearInvitedUuidsForNewlyCreatedGroup: action(
    'clearInvitedUuidsForNewlyCreatedGroup'
  ),
  setIsNearBottom: action('setIsNearBottom'),
  loadOlderMessages: action('loadOlderMessages'),
  loadNewerMessages: action('loadNewerMessages'),
  loadNewestMessages: action('loadNewestMessages'),
  markMessageRead: action('markMessageRead'),
  toggleSelectMessage: action('toggleSelectMessage'),
  targetMessage: action('targetMessage'),
  clearTargetedMessage: action('clearTargetedMessage'),
  updateSharedGroups: action('updateSharedGroups'),

  reactToMessage: action('reactToMessage'),
  setQuoteByMessageId: action('setQuoteByMessageId'),
  retryDeleteForEveryone: action('retryDeleteForEveryone'),
  retryMessageSend: action('retryMessageSend'),
  deleteMessages: action('deleteMessages'),
  deleteMessageForEveryone: action('deleteMessageForEveryone'),
  saveAttachment: action('saveAttachment'),
  pushPanelForConversation: action('pushPanelForConversation'),
  showContactDetail: action('showContactDetail'),
  showContactModal: action('showContactModal'),
  showConversation: action('showConversation'),
  kickOffAttachmentDownload: action('kickOffAttachmentDownload'),
  markAttachmentAsCorrupted: action('markAttachmentAsCorrupted'),
  messageExpanded: action('messageExpanded'),
  showLightbox: action('showLightbox'),
  showLightboxForViewOnceMedia: action('showLightboxForViewOnceMedia'),
  doubleCheckMissingQuoteReference: action('doubleCheckMissingQuoteReference'),

  openGiftBadge: action('openGiftBadge'),
  scrollToQuotedMessage: action('scrollToQuotedMessage'),
  showExpiredIncomingTapToViewToast: action(
    'showExpiredIncomingTapToViewToast'
  ),
  showExpiredOutgoingTapToViewToast: action(
    'showExpiredOutgoingTapToViewToast'
  ),
  toggleForwardMessagesModal: action('toggleForwardMessagesModal'),

  toggleSafetyNumberModal: action('toggleSafetyNumberModal'),

  startCallingLobby: action('startCallingLobby'),
  startConversation: action('startConversation'),
  returnToActiveCall: action('returnToActiveCall'),

  closeContactSpoofingReview: action('closeContactSpoofingReview'),
  reviewGroupMemberNameCollision: action('reviewGroupMemberNameCollision'),
  reviewMessageRequestNameCollision: action(
    'reviewMessageRequestNameCollision'
  ),

  unblurAvatar: action('unblurAvatar'),

  peekGroupCallForTheFirstTime: action('peekGroupCallForTheFirstTime'),
  peekGroupCallIfItHasMembers: action('peekGroupCallIfItHasMembers'),

  viewStory: action('viewStory'),

  onReplyToMessage: action('onReplyToMessage'),
});

const renderItem = ({
  messageId,
  containerElementRef,
  containerWidthBreakpoint,
}: {
  messageId: string;
  containerElementRef: React.RefObject<HTMLElement>;
  containerWidthBreakpoint: WidthBreakpoint;
}) => (
  <TimelineItem
    getPreferredBadge={() => undefined}
    id=""
    isTargeted={false}
    i18n={i18n}
    interactionMode="keyboard"
    isNextItemCallingNotification={false}
    theme={ThemeType.light}
    platform="darwin"
    containerElementRef={containerElementRef}
    containerWidthBreakpoint={containerWidthBreakpoint}
    conversationId=""
    item={items[messageId]}
    renderAudioAttachment={() => <div>*AudioAttachment*</div>}
    renderContact={() => '*ContactName*'}
    renderEmojiPicker={() => <div />}
    renderReactionPicker={() => <div />}
    renderUniversalTimerNotification={() => (
      <div>*UniversalTimerNotification*</div>
    )}
    shouldCollapseAbove={false}
    shouldCollapseBelow={false}
    shouldHideMetadata={false}
    shouldRenderDateHeader={false}
    {...actions()}
  />
);

const renderContactSpoofingReviewDialog = (
  props: SmartContactSpoofingReviewDialogPropsType
) => {
  const sharedProps = {
    acceptConversation: action('acceptConversation'),
    blockAndReportSpam: action('blockAndReportSpam'),
    blockConversation: action('blockConversation'),
    deleteConversation: action('deleteConversation'),
    getPreferredBadge: () => undefined,
    i18n,
    removeMember: action('removeMember'),
    showContactModal: action('showContactModal'),
    theme: ThemeType.dark,
  };

  if (props.type === ContactSpoofingType.MultipleGroupMembersWithSameTitle) {
    return (
      <ContactSpoofingReviewDialog
        {...props}
        {...sharedProps}
        group={{
          ...getDefaultConversation(),
          areWeAdmin: true,
        }}
      />
    );
  }

  return <ContactSpoofingReviewDialog {...props} {...sharedProps} />;
};

const getAbout = () => text('about', '👍 Free to chat');
const getTitle = () => text('name', 'Cayce Bollard');
const getProfileName = () => text('profileName', 'Cayce Bollard (profile)');
const getAvatarPath = () =>
  text('avatarPath', '/fixtures/kitten-4-112-112.jpg');
const getPhoneNumber = () => text('phoneNumber', '+1 (808) 555-1234');

const renderHeroRow = () => {
  function Wrapper() {
    const theme = React.useContext(StorybookThemeContext);
    return (
      <ConversationHero
        about={getAbout()}
        acceptedMessageRequest
        avatarPath={getAvatarPath()}
        badge={undefined}
        conversationType="direct"
        id={getDefaultConversation().id}
        i18n={i18n}
        isMe={false}
        phoneNumber={getPhoneNumber()}
        profileName={getProfileName()}
        sharedGroupNames={['NYC Rock Climbers', 'Dinner Party']}
        theme={theme}
        title={getTitle()}
        unblurAvatar={action('unblurAvatar')}
        updateSharedGroups={noop}
        viewUserStories={action('viewUserStories')}
      />
    );
  }
  return <Wrapper />;
};
const renderTypingBubble = () => (
  <TypingBubble
    acceptedMessageRequest
    badge={undefined}
    color={getRandomColor()}
    conversationType="direct"
    phoneNumber="+18005552222"
    i18n={i18n}
    isMe={false}
    title="title"
    theme={ThemeType.light}
    sharedGroupNames={[]}
  />
);
const renderMiniPlayer = () => (
  <div>If active, this is where smart mini player would be</div>
);

const useProps = (overrideProps: Partial<PropsType> = {}): PropsType => ({
  discardMessages: action('discardMessages'),
  getPreferredBadge: () => undefined,
  i18n,
  theme: React.useContext(StorybookThemeContext),

  getTimestampForMessage: Date.now,
  haveNewest: boolean('haveNewest', overrideProps.haveNewest !== false),
  haveOldest: boolean('haveOldest', overrideProps.haveOldest !== false),
  isConversationSelected: true,
  isIncomingMessageRequest: boolean(
    'isIncomingMessageRequest',
    overrideProps.isIncomingMessageRequest === true
  ),
  items: overrideProps.items || Object.keys(items),
  messageChangeCounter: 0,
  scrollToIndex: overrideProps.scrollToIndex,
  scrollToIndexCounter: 0,
  shouldShowMiniPlayer: Boolean(overrideProps.shouldShowMiniPlayer),
  totalUnseen: number('totalUnseen', overrideProps.totalUnseen || 0),
  oldestUnseenIndex:
    number('oldestUnseenIndex', overrideProps.oldestUnseenIndex || 0) ||
    undefined,
  invitedContactsForNewlyCreatedGroup:
    overrideProps.invitedContactsForNewlyCreatedGroup || [],
  warning: overrideProps.warning,

  id: uuid(),
  renderItem,
  renderHeroRow,
  renderMiniPlayer,
  renderTypingBubble,
  renderContactSpoofingReviewDialog,
  isSomeoneTyping: overrideProps.isSomeoneTyping || false,

  ...actions(),
});

export function OldestAndNewest(): JSX.Element {
  const props = useProps();

  return <Timeline {...props} />;
}

OldestAndNewest.story = {
  name: 'Oldest and Newest',
};

export function WithActiveMessageRequest(): JSX.Element {
  const props = useProps({
    isIncomingMessageRequest: true,
  });

  return <Timeline {...props} />;
}

WithActiveMessageRequest.story = {
  name: 'With active message request',
};

export function WithoutNewestMessage(): JSX.Element {
  const props = useProps({
    haveNewest: false,
  });

  return <Timeline {...props} />;
}

export function WithoutNewestMessageActiveMessageRequest(): JSX.Element {
  const props = useProps({
    haveOldest: false,
    isIncomingMessageRequest: true,
  });

  return <Timeline {...props} />;
}

WithoutNewestMessageActiveMessageRequest.story = {
  name: 'Without newest message, active message request',
};

export function WithoutOldestMessage(): JSX.Element {
  const props = useProps({
    haveOldest: false,
    scrollToIndex: -1,
  });

  return <Timeline {...props} />;
}

export function EmptyJustHero(): JSX.Element {
  const props = useProps({
    items: [],
  });

  return <Timeline {...props} />;
}

EmptyJustHero.story = {
  name: 'Empty (just hero)',
};

export function LastSeen(): JSX.Element {
  const props = useProps({
    oldestUnseenIndex: 13,
    totalUnseen: 2,
  });

  return <Timeline {...props} />;
}

export function TargetIndexToTop(): JSX.Element {
  const props = useProps({
    scrollToIndex: 0,
  });

  return <Timeline {...props} />;
}

TargetIndexToTop.story = {
  name: 'Target Index to Top',
};

export function TypingIndicator(): JSX.Element {
  const props = useProps({ isSomeoneTyping: true });

  return <Timeline {...props} />;
}

export function WithInvitedContactsForANewlyCreatedGroup(): JSX.Element {
  const props = useProps({
    invitedContactsForNewlyCreatedGroup: [
      getDefaultConversation({
        id: 'abc123',
        title: 'John Bon Bon Jovi',
      }),
      getDefaultConversation({
        id: 'def456',
        title: 'Bon John Bon Jovi',
      }),
    ],
  });

  return <Timeline {...props} />;
}

WithInvitedContactsForANewlyCreatedGroup.story = {
  name: 'With invited contacts for a newly-created group',
};

export function WithSameNameInDirectConversationWarning(): JSX.Element {
  const props = useProps({
    warning: {
      type: ContactSpoofingType.DirectConversationWithSameTitle,
      safeConversation: getDefaultConversation(),
    },
    items: [],
  });

  return <Timeline {...props} />;
}

WithSameNameInDirectConversationWarning.story = {
  name: 'With "same name in direct conversation" warning',
};

export function WithSameNameInGroupConversationWarning(): JSX.Element {
  const props = useProps({
    warning: {
      type: ContactSpoofingType.MultipleGroupMembersWithSameTitle,
      acknowledgedGroupNameCollisions: {},
      groupNameCollisions: {
        Alice: times(2, () => uuid()),
        Bob: times(3, () => uuid()),
      },
    },
    items: [],
  });

  return <Timeline {...props} />;
}

WithSameNameInGroupConversationWarning.story = {
  name: 'With "same name in group conversation" warning',
};

export function WithJustMiniPlayer(): JSX.Element {
  const props = useProps({
    shouldShowMiniPlayer: true,
    items: [],
  });

  return <Timeline {...props} />;
}
