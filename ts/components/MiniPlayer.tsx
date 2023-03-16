// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback } from 'react';
import type { LocalizerType } from '../types/Util';
import { durationToPlaybackText } from '../util/durationToPlaybackText';
import { Emojify } from './conversation/Emojify';
import { PlaybackButton } from './PlaybackButton';
import { PlaybackRateButton } from './PlaybackRateButton';

export enum PlayerState {
  loading = 'loading',
  playing = 'playing',
  paused = 'paused',
}

export type Props = Readonly<{
  i18n: LocalizerType;
  title: string;
  currentTime: number;
  // not available until audio has loaded
  duration: number | undefined;
  playbackRate: number;
  state: PlayerState;
  onPlay: () => void;
  onPause: () => void;
  onPlaybackRate: (rate: number) => void;
  onClose: () => void;
}>;

export function MiniPlayer({
  i18n,
  title,
  state,
  currentTime,
  duration,
  playbackRate,
  onPlay,
  onPause,
  onPlaybackRate,
  onClose,
}: Props): JSX.Element {
  const updatePlaybackRate = useCallback(() => {
    onPlaybackRate(PlaybackRateButton.nextPlaybackRate(playbackRate));
  }, [playbackRate, onPlaybackRate]);

  const handleClick = useCallback(() => {
    switch (state) {
      case PlayerState.playing:
        onPause();
        break;
      case PlayerState.paused:
        onPlay();
        break;
      case PlayerState.loading:
        break;
      default:
        throw new TypeError(`Missing case: ${state}`);
    }
  }, [state, onPause, onPlay]);

  let label: string | undefined;
  let mod: 'play' | 'pause' | 'pending';
  switch (state) {
    case PlayerState.playing:
      label = i18n('MessageAudio--pause');
      mod = 'pause';
      break;
    case PlayerState.paused:
      label = i18n('MessageAudio--play');
      mod = 'play';
      break;
    case PlayerState.loading:
      label = i18n('MessageAudio--pending');
      mod = 'pending';
      break;
    default:
      throw new TypeError(`Missing case ${state}`);
  }

  return (
    <div className="MiniPlayer">
      <PlaybackButton
        context="incoming"
        variant="mini"
        mod={mod}
        label={label}
        onClick={handleClick}
      />

      <div className="MiniPlayer__state">
        <Emojify text={title} />
        <span className="MiniPlayer__middot">&middot;</span>
        {duration !== undefined && (
          <span>
            {durationToPlaybackText(
              state === PlayerState.loading ? duration : currentTime
            )}
          </span>
        )}
      </div>

      <PlaybackRateButton
        i18n={i18n}
        variant="mini-player"
        playbackRate={playbackRate}
        onClick={updatePlaybackRate}
        visible={state === 'playing'}
      />

      <button
        type="button"
        className="MiniPlayer__close-button"
        onClick={onClose}
        aria-label={i18n('close')}
      />
    </div>
  );
}
