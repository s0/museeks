import { ControllerEndpoint } from '@synesthesia-project/core/lib/protocols/control';
import { DEFAULT_SYNESTHESIA_PORT } from '@synesthesia-project/core/lib/constants';

import * as app from './app';
import store from '../store';
import types, { PlayerStatusUpdatedPayload } from '../constants/action-types';
import { Track, PlayerStatus } from '../../shared/types/interfaces';
import * as utils from '../utils/utils';

interface PlayerOptions {
  playbackRate?: number;
  audioOutputDevice?: string;
  volume?: number;
  muted?: boolean;
}

interface SynesthesiaMeta {
  title: string;
  artist?: string;
  album?: string;
}

class Player {
  private audio: HTMLAudioElement;
  private audioMeta: SynesthesiaMeta | null = null;
  private durationThresholdReached: boolean;
  public threshold: number;
  private synesthesiaEndpoint: Promise<{
    endpoint: ControllerEndpoint;
    ws: WebSocket;
  }> | null = null;

  constructor(options?: PlayerOptions) {
    const mergedOptions = {
      playbackRate: 1,
      volume: 1,
      muted: false,
      audioOutputDevice: 'default',
      ...options
    };

    this.audio = new Audio();

    this.audio.defaultPlaybackRate = mergedOptions.playbackRate;
    // eslint-disable-next-line
    // @ts-ignore
    this.audio.setSinkId(mergedOptions.audioOutputDevice);
    this.audio.playbackRate = mergedOptions.playbackRate;
    this.audio.volume = mergedOptions.volume;
    this.audio.muted = mergedOptions.muted;

    this.threshold = 0.75;
    this.durationThresholdReached = false;

    // Initialize Synesthesia
    this.updateState = this.updateState.bind(this);
    this.audio.addEventListener('playing', this.updateState);
    this.audio.addEventListener('pause', this.updateState);
    this.audio.addEventListener('seeked', this.updateState);
  }

  private getSynesthesiaEndpoint() {
    if (!this.synesthesiaEndpoint) {
      let synesthesiaEnabled = app.config.get('synesthesiaEnabled');
      if (typeof synesthesiaEnabled !== 'boolean')
        synesthesiaEnabled = false;
      if (!synesthesiaEnabled) {
        return false;
      }
      let synesthesiaPort = app.config.get('synesthesiaPort');
      if (typeof synesthesiaPort !== 'number')
        synesthesiaPort = DEFAULT_SYNESTHESIA_PORT;
      const endpointPromise =
        this.synesthesiaEndpoint =
        new Promise((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${synesthesiaPort}/control`);
          const endpoint = new ControllerEndpoint(msg => ws.send(JSON.stringify(msg)));
          ws.addEventListener('open', () => {
            endpoint.setRequestHandler(async req => {
              if (!this.audio) return { success: false };
              switch (req.request) {
                case 'pause':
                  this.audio.pause();
                  return { success: true };
                case 'toggle':
                  this.audio.paused ? this.audio.play() : this.audio.pause();
                  return { success: true };
                case 'go-to-time':
                  this.audio.currentTime = req.positionMillis / 1000;
                  return { success: true };
                case 'play-speed':
                  this.audio.playbackRate = req.playSpeed;
                  return { success: true };
              }
            });
            resolve({endpoint, ws});
          });
          ws.addEventListener('error', err => {
            if (endpointPromise === this.synesthesiaEndpoint)
              this.synesthesiaEndpoint = null;
            reject(err);
          });
          ws.addEventListener('close', _ => {
            if (endpointPromise === this.synesthesiaEndpoint)
              this.synesthesiaEndpoint = null;
          });
          ws.addEventListener('message', msg => {
            endpoint.recvMessage(JSON.parse(msg.data));
          });
        });

        this.synesthesiaEndpoint.catch(err => {
          console.error(err);
          if (this.synesthesiaEndpoint === endpointPromise) {
            // Remove the endpoint so an attempt will be tried again
            this.synesthesiaEndpoint = null;
          }
        });
      }
    return this.synesthesiaEndpoint;
  }

  /**
   * Called when e.g. the synesthesia config has changed and 
   */
  public resetSynesthesia() {
    if (this.synesthesiaEndpoint) {
      this.synesthesiaEndpoint.then(endpoint => endpoint.ws.close());
    }
    this.synesthesiaEndpoint = null;
    // Re-initialize synesthesia and send state
    this.updateState();
  }

  private updateState() {
    // Push to redux
    const payload: PlayerStatusUpdatedPayload = {
      playerStatus: this.audio.paused ? PlayerStatus.PAUSE : PlayerStatus.PLAY
    };
    store.dispatch({
      type: types.PLAYER_STATUS_UPDATED,
      payload
    })
    // If we are using synesthesia, send updated state
    const endpoint = this.getSynesthesiaEndpoint();
    if (endpoint) {
      endpoint.then(endpoint => {
        if (!this.audioMeta || !this.audio) return;
        endpoint.endpoint.sendState({
          layers: [{
            file: {
              type: 'meta' as 'meta',
              title: this.audioMeta.title,
              artist: this.audioMeta.artist,
              album: this.audioMeta.album,
              lengthMillis: this.audio.duration * 1000
            },
            state: this.audio.paused ? {
              type: 'paused',
              positionMillis:
                this.audio.currentTime * 1000
            } : {
                type: 'playing',
                effectiveStartTimeMillis: new Date().getTime() - this.audio.currentTime * 1000 / this.audio.playbackRate,
                playSpeed: this.audio.playbackRate
              }
          }]
        });
      });
    }
  }

  async play() {
    await this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  stop() {
    this.audio.pause();
  }

  mute() {
    this.audio.muted = true;
  }

  unmute() {
    this.audio.muted = false;
  }

  getAudio() {
    return this.audio;
  }

  getCurrentTime() {
    return this.audio.currentTime;
  }

  getVolume() {
    return this.audio.volume;
  }

  getSrc() {
    return this.audio.src;
  }

  setAudioVolume(volume: number) {
    this.audio.volume = volume;
  }

  setAudioPlaybackRate(playbackRate: number) {
    this.audio.playbackRate = playbackRate;
    this.audio.defaultPlaybackRate = playbackRate;
  }

  async setOutputDevice(deviceId: string) {
    // eslint-disable-next-line
    // @ts-ignore
    await this.audio.setSinkId(deviceId);
  }

  setAudioTrack(track: Track) {
    // When we change song, need to update the thresholdReached indicator.
    this.durationThresholdReached = false;
    this.audioMeta = {
      title: track.title,
      artist: track.artist.join(', '),
      album: track.album
    }
    this.audio.src = utils.parseUri(track.path);
  }

  setAudioCurrentTime(currentTime: number) {
    this.audio.currentTime = currentTime;
  }

  isMuted() {
    return this.audio.muted;
  }

  isPaused() {
    return this.audio.paused;
  }

  isThresholdReached() {
    if (!this.durationThresholdReached && this.audio.currentTime >= this.audio.duration * this.threshold) {
      this.durationThresholdReached = true;
    }

    return this.durationThresholdReached;
  }
}

export default new Player({
  volume: app.config.get('audioVolume'),
  playbackRate: app.config.get('audioPlaybackRate'),
  audioOutputDevice: app.config.get('audioOutputDevice'),
  muted: app.config.get('audioMuted')
});
