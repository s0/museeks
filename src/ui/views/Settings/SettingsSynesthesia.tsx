import * as React from 'react';
import { DEFAULT_SYNESTHESIA_PORT } from '@synesthesia-project/core/lib/constants';

import ExternalLink from '../../elements/ExternalLink/ExternalLink';

import * as SettingsActions from '../../actions/SettingsActions';

import CheckboxSetting from '../../components/SettingCheckbox/SettingCheckbox';
import * as Setting from '../../components/Setting/Setting';
import { Config } from '../../../shared/types/interfaces';

interface Props {
  config: Config;
}

export default class SettingsUI extends React.Component<Props> {

  setSynesthesiaPort(e: React.SyntheticEvent<HTMLInputElement>) {
    const value = e.currentTarget.value && e.currentTarget.value !== '' ?
      parseInt(e.currentTarget.value, 10) : null;
    SettingsActions.setSynesthesiaPort(value);
  }

  render() {
    const { config } = this.props;

    return (
      <div className='setting setting-interface'>
        <Setting.Section>
          <h3>What is Synesthesia?</h3>
          <p>
            Synesthesia is a project that allows you to synchronize lighting
            and other things to your music.
            Find out more on the
            <ExternalLink href='https://synesthesia-project.org/'>synesthesia project homepage</ExternalLink>.
          </p>
        </Setting.Section>
        <CheckboxSetting
          slug='synesthesia-enabled'
          title='Enable Synesthesia Integration'
          description='Send song playback information to a local synesthesia server'
          defaultValue={config.synesthesiaEnabled}
          onClick={SettingsActions.toggleSynesthesiaEnabled}
        />
        <Setting.Section>
          <Setting.Label htmlFor='setting-synesthesia-port'>Synesthesia Port</Setting.Label>
          <Setting.Input
            id='setting-synesthesia-port'
            defaultValue={`${config.synesthesiaPort || ''}`}
            onChange={this.setSynesthesiaPort}
            type='number'
            placeholder={`Default ${DEFAULT_SYNESTHESIA_PORT}`}
            min={1}
            step={1}
          />
          <Setting.Description>
            Which port should we use to connect to synesthesia?
            If left blank, the default port ({DEFAULT_SYNESTHESIA_PORT})
            will be used.
          </Setting.Description>
        </Setting.Section>
      </div>
    );
  }
}
