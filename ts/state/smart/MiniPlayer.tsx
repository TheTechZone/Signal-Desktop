// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { MiniPlayer, PlayerState } from '../../components/MiniPlayer';
import { usePrevious } from '../../hooks/usePrevious';
import { useAudioPlayerActions } from '../ducks/audioPlayer';
import {
  selectAudioPlayerActive,
  selectVoiceNoteTitle,
} from '../selectors/audioPlayer';
import { getIntl } from '../selectors/user';

/**
 * Wires the dispatch props and shows/hides the MiniPlayer
 *
 * It also triggers side-effecting actions (actual playback) in response to changes in
 * the state
 */
export function SmartMiniPlayer(): JSX.Element | null {
  const i18n = useSelector(getIntl);
  const active = useSelector(selectAudioPlayerActive);
  const getVoiceNoteTitle = useSelector(selectVoiceNoteTitle);
  const {
    setIsPlaying,
    setPlaybackRate,
    unloadMessageAudio,
    playMessageAudio,
  } = useAudioPlayerActions();
  const handlePlay = useCallback(() => setIsPlaying(true), [setIsPlaying]);
  const handlePause = useCallback(() => setIsPlaying(false), [setIsPlaying]);
  const previousContent = usePrevious(undefined, active?.content);

  useEffect(() => {
    if (!active) {
      return;
    }

    const { content } = active;

    // if no content, stop playing
    if (!content) {
      if (active.playing) {
        setIsPlaying(false);
      }
      return;
    }

    // if the content changed, play the new content
    if (content.current.id !== previousContent?.current.id) {
      playMessageAudio(content.isConsecutive);
    }
    // if the start position changed, play at new position
    if (content.startPosition !== previousContent?.startPosition) {
      playMessageAudio(false);
    }
  });

  if (!active?.content) {
    return null;
  }

  let state = PlayerState.loading;
  if (active.content.current.url) {
    state = active.playing ? PlayerState.playing : PlayerState.paused;
  }

  return (
    <MiniPlayer
      i18n={i18n}
      title={getVoiceNoteTitle(active.content.current)}
      onPlay={handlePlay}
      onPause={handlePause}
      onPlaybackRate={setPlaybackRate}
      onClose={unloadMessageAudio}
      state={state}
      currentTime={active.currentTime}
      duration={active.duration}
      playbackRate={active.playbackRate}
    />
  );
}
