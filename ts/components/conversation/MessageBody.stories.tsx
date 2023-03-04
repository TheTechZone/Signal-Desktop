// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';

import { boolean, text } from '@storybook/addon-knobs';

import type { Props } from './MessageBody';
import { MessageBody } from './MessageBody';
import { setupI18n } from '../../util/setupI18n';
import enMessages from '../../../_locales/en/messages.json';
import { BodyRange } from '../../types/Util';

const i18n = setupI18n('en', enMessages);

export default {
  title: 'Components/Conversation/MessageBody',
};

const createProps = (overrideProps: Partial<Props> = {}): Props => ({
  bodyRanges: overrideProps.bodyRanges,
  disableJumbomoji: boolean(
    'disableJumbomoji',
    overrideProps.disableJumbomoji || false
  ),
  disableLinks: boolean('disableLinks', overrideProps.disableLinks || false),
  direction: 'incoming',
  i18n,
  text: text('text', overrideProps.text || ''),
  textAttachment: overrideProps.textAttachment || {
    pending: boolean('textPending', false),
  },
});

export function LinksEnabled(): JSX.Element {
  const props = createProps({
    text: 'Check out https://www.signal.org',
  });

  return <MessageBody {...props} />;
}

export function LinksDisabled(): JSX.Element {
  const props = createProps({
    disableLinks: true,
    text: 'Check out https://www.signal.org',
  });

  return <MessageBody {...props} />;
}

export function EmojiSizeBasedOnCount(): JSX.Element {
  const props = createProps();

  return (
    <>
      <MessageBody {...props} text="😹" />
      <br />
      <MessageBody {...props} text="😹😹😹" />
      <br />
      <MessageBody {...props} text="😹😹😹😹😹" />
      <br />
      <MessageBody {...props} text="😹😹😹😹😹😹😹" />
      <br />
      <MessageBody {...props} text="😹😹😹😹😹😹😹😹😹" />
    </>
  );
}

export function JumbomojiEnabled(): JSX.Element {
  const props = createProps({
    text: '😹',
  });

  return <MessageBody {...props} />;
}

export function JumbomojiDisabled(): JSX.Element {
  const props = createProps({
    disableJumbomoji: true,
    text: '😹',
  });

  return <MessageBody {...props} />;
}

export function JumbomojiDisabledByText(): JSX.Element {
  const props = createProps({
    text: 'not a jumbo kitty 😹',
  });

  return <MessageBody {...props} />;
}

JumbomojiDisabledByText.story = {
  name: 'Jumbomoji Disabled by Text',
};

export function TextPending(): JSX.Element {
  const props = createProps({
    text: 'Check out https://www.signal.org',
    textAttachment: {
      pending: true,
    },
  });

  return <MessageBody {...props} />;
}

export function Mention(): JSX.Element {
  const props = createProps({
    bodyRanges: [
      {
        start: 5,
        length: 1,
        mentionUuid: 'tuv',
        replacementText: 'Bender B Rodriguez 🤖',
        conversationID: 'x',
      },
    ],
    text: 'Like \uFFFC once said: My story is a lot like yours, only more interesting because it involves robots',
  });

  return <MessageBody {...props} />;
}

Mention.story = {
  name: '@Mention',
};

export function MultipleMentions(): JSX.Element {
  const props = createProps({
    // These are intentionally in a mixed order to test how we deal with that
    bodyRanges: [
      {
        start: 2,
        length: 1,
        mentionUuid: 'def',
        replacementText: 'Philip J Fry',
        conversationID: 'x',
      },
      {
        start: 4,
        length: 1,
        mentionUuid: 'abc',
        replacementText: 'Professor Farnsworth',
        conversationID: 'x',
      },
      {
        start: 0,
        length: 1,
        mentionUuid: 'xyz',
        replacementText: 'Yancy Fry',
        conversationID: 'x',
      },
    ],
    text: '\uFFFC \uFFFC \uFFFC',
  });

  return <MessageBody {...props} />;
}

MultipleMentions.story = {
  name: 'Multiple @Mentions',
};

export function ComplexMessageBody(): JSX.Element {
  const props = createProps({
    bodyRanges: [
      // These are intentionally in a mixed order to test how we deal with that
      {
        start: 78,
        length: 1,
        mentionUuid: 'wer',
        replacementText: 'Acid Burn',
        conversationID: 'x',
      },
      {
        start: 80,
        length: 1,
        mentionUuid: 'xox',
        replacementText: 'Cereal Killer',
        conversationID: 'x',
      },
      {
        start: 4,
        length: 1,
        mentionUuid: 'ldo',
        replacementText: 'Zero Cool',
        conversationID: 'x',
      },
    ],
    direction: 'outgoing',
    text: 'Hey \uFFFC\nCheck out https://www.signal.org I think you will really like it 😍\n\ncc \uFFFC \uFFFC',
  });

  return <MessageBody {...props} />;
}

ComplexMessageBody.story = {
  name: 'Complex MessageBody',
};

export function FormattingBasic(): JSX.Element {
  const props = createProps({
    bodyRanges: [
      // Abracadabra
      {
        start: 36,
        length: 11,
        style: BodyRange.Style.BOLD,
      },
      // Open Sesame
      {
        start: 46,
        length: 10,
        style: BodyRange.Style.ITALIC,
      },
      // This is the key! And the treasure, too, if we can only get our hands on it!
      {
        start: 357,
        length: 75,
        style: BodyRange.Style.MONOSPACE,
      },

      // The real magic is to understand which words work, and when, and for what
      {
        start: 138,
        length: 73,
        style: BodyRange.Style.STRIKETHROUGH,
      },
      // as if the key to the treasure is the treasure!
      {
        start: 446,
        length: 46,
        style: BodyRange.Style.SPOILER,
      },
      {
        start: 110,
        length: 27,
        style: BodyRange.Style.NONE,
      },
    ],
    text: '… It’s in words that the magic is – Abracadabra, Open Sesame, and the rest – but the magic words in one story aren’t magical in the next. The real magic is to understand which words work, and when, and for what; the trick is to learn the trick. … And those words are made from the letters of our alphabet: a couple-dozen squiggles we can draw with the pen. This is the key! And the treasure, too, if we can only get our hands on it! It’s as if – as if the key to the treasure is the treasure!',
  });

  return <MessageBody {...props} />;
}

export function FormattingComplex(): JSX.Element {
  const props = createProps({
    bodyRanges: [
      // mention
      {
        start: 24,
        length: 1,
        mentionUuid: 'abc',
        conversationID: 'x',
        replacementText: '🤖 Hello',
      },
      // bold wraps mention
      {
        start: 14,
        length: 31,
        style: BodyRange.Style.BOLD,
      },
      // italic overlaps with bold
      {
        start: 29,
        length: 39,
        style: BodyRange.Style.ITALIC,
      },
      // strikethrough overlaps link
      {
        start: 397,
        length: 29,
        style: BodyRange.Style.STRIKETHROUGH,
      },
      // strikethrough over metion
      {
        start: 465,
        length: 49,
        style: BodyRange.Style.STRIKETHROUGH,
      },
      // mention 2
      {
        start: 501,
        length: 1,
        mentionUuid: 'abc',
        conversationID: 'x',
        replacementText: '🤖 Hello',
      },
    ],
    text:
      'Computational processes \uFFFC are abstract beings that inhabit computers. ' +
      'As they evolve, processes manipulate other abstract things called data. ' +
      'The evolution of a process is directed by a pattern of rules called a program. ' +
      'People create programs to direct processes. In effect, we conjure the spirits of ' +
      'the computer with our spells.\n\n' +
      'link preceded by emoji: 🤖https://signal.org/\n\n' +
      'link overlapping strikethrough: https://signal.org/ (up to "...//signal")\n\n' +
      'strikethrough going through mention \uFFFC all the way',
  });

  return <MessageBody {...props} />;
}
