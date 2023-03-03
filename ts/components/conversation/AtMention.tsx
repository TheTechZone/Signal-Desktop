// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { KeyboardEventHandler } from 'react';
import React from 'react';
import { Emojify } from './Emojify';

export function AtMention({
  id,
  name,
  direction,
  onClick,
  onKeyUp,
}: {
  id: string;
  name: string;
  direction: 'incoming' | 'outgoing' | undefined;
  onClick: () => void;
  onKeyUp: KeyboardEventHandler;
}): JSX.Element {
  return (
    <span
      className={`MessageBody__at-mention MessageBody__at-mention--${direction}`}
      onClick={onClick}
      onKeyUp={onKeyUp}
      tabIndex={0}
      role="link"
      data-id={id}
      data-title={name}
    >
      <bdi>
        @
        <Emojify text={name} />
      </bdi>
    </span>
  );
}
