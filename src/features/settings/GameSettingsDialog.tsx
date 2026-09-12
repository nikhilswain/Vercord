import { useId } from 'react';
import { Dialog } from '../../components/Dialog';
import { MUSIC_TRACKS, getMusicTrack } from '../audio/music-catalog';
import type { GameMusicControls } from '../audio/use-game-music';
import { RpgIcon } from '../rpg/RpgIcon';
import './game-settings.css';

interface Props {
  music: GameMusicControls;
  demo: boolean;
  onClose(): void;
}

export function GameSettingsDialog({ music, demo, onClose }: Props) {
  const id = useId();
  const message = {
    waiting: 'Music starts when you interact with the game.',
    loading: 'Loading music…',
    playing: 'Playing',
    paused: 'Paused while the game is in the background.',
    muted: 'Background music is muted.',
    error: 'This track could not load. Try again.',
  }[music.status];
  return (
    <Dialog
      open
      title="Settings"
      className="rpg-dialog game-settings-dialog"
      onClose={onClose}
      footer={
        <button className="rpg-button" onClick={onClose}>
          Back to exploring
        </button>
      }
    >
      <button
        className="rpg-icon-button rpg-panel-close"
        aria-label="Close settings"
        onClick={onClose}
      >
        <RpgIcon name="close" />
      </button>
      <p className="rpg-muted">Make yourself at home. Changes save on this device.</p>
      <section className="game-settings-section" aria-labelledby={`${id}-audio`}>
        <h3 id={`${id}-audio`}>
          <RpgIcon name="music" /> Sound
        </h3>
        <div className="game-settings-volume-label">
          <label htmlFor={`${id}-volume`}>Background volume</label>
          <output htmlFor={`${id}-volume`}>{music.volume}%</output>
        </div>
        <div className="game-settings-volume">
          <button
            className="rpg-icon-button"
            aria-label={music.volume === 0 ? 'Unmute background music' : 'Mute background music'}
            title={music.volume === 0 ? 'Unmute' : 'Mute'}
            aria-pressed={music.volume === 0}
            onClick={music.toggleMute}
          >
            <RpgIcon name={music.volume === 0 ? 'muted' : 'volume'} />
          </button>
          <input
            id={`${id}-volume`}
            type="range"
            min="0"
            max="100"
            step="1"
            value={music.volume}
            aria-valuetext={`${music.volume} percent`}
            onChange={(event) => music.setVolume(Number(event.target.value))}
          />
        </div>
        <div className="game-settings-playing">
          <div>
            <span className="rpg-muted">Background music</span>
            <strong>{getMusicTrack(music.trackId).title}</strong>
          </div>
          <span className="game-settings-play-state" role="status">
            {message}
          </span>
        </div>
        {(music.status === 'waiting' || music.status === 'error') && (
          <button className="rpg-button game-settings-retry" onClick={music.retry}>
            {music.status === 'error' ? 'Retry music' : 'Start music'}
          </button>
        )}
      </section>
      {demo && (
        <fieldset className="game-settings-tracks">
          <legend>
            Try a soundtrack <span className="rpg-muted">Demo only</span>
          </legend>
          {MUSIC_TRACKS.map((track) => (
            <label
              key={track.id}
              className="game-settings-track"
              data-selected={music.trackId === track.id}
            >
              <input
                type="radio"
                name={`${id}-track`}
                value={track.id}
                checked={music.trackId === track.id}
                onChange={() => music.selectTrack(track.id)}
              />
              <span>{track.title}</span>
              <RpgIcon name="music" />
            </label>
          ))}
        </fieldset>
      )}
    </Dialog>
  );
}
