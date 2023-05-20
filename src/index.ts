import _ from 'lodash';
import Fs from 'fs-extra';
import Axios from 'axios';
import { decode } from 'js-base64';
import { jsonc } from 'jsonc';
import { _log, _err, _setFailed, _isFailed } from './utils/log';
import { MClient, MClientOptions } from './m/client';
import { WClient, WClientOptions } from './w/client';
import { PartialDeep } from './@types';
import { dama } from './utils/dama';

export type Config = PartialDeep<{
  users: MClientOptions[];
  m: MClientOptions[];
  w: WClientOptions[];
  cids: string[];
  failedWebhook: string;
  kuxiToken: string;
  rrocrAppkey: string;
  savingMode: boolean;
}>;

_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;

const getConfig = async (): Promise<Config> => {
  let config = {};
  if (process.env.CONFIG_URL) {
    try {
      const { data } = await Axios.get(process.env.CONFIG_URL);
      config = typeof data === 'string' ? jsonc.parse(data) : data;
    } catch (e: any) {
      _err('CONFIG_URL 配置错误', e.toString());
    }
  } else if (Fs.existsSync('config.json')) {
    try {
      config = Fs.readJsonSync('config.json');
    } catch (e: any) {
      _err('config.json 格式错误', e.toString());
    }
  } else if (Fs.existsSync('config.jsonc')) {
    try {
      config = jsonc.parse(Fs.readFileSync('config.jsonc').toString());
    } catch (e: any) {
      _err('config.jsonc 格式错误', e.toString());
    }
  }
  return config;
};

(async () => {
  const config = await getConfig();

  dama.config(config);

  // M
  const mConfig = config.users || config.m || [];
  const { savingMode } = config;
  if (mConfig.length) {
    for (const [i, config] of Object.entries(mConfig)) {
      _log(`\nM[${i}]`);
      if (!config || (typeof config !== 'string' && !config.cookie)) continue;
      const mClient = new MClient(config, savingMode);
      await mClient.signIn();
      await mClient.earnCoin();
    }
  }

  // W
  const wConfig = config.w || [];
  if (wConfig.length) {
    _log('\nW');
    await WClient.fetchGiftListMap([
      decode('MTAwODA4ZmM0MzlkZWRiYjA2Y2E1ZmQ4NTg4NDhlNTIxYjg3MTY='),
      ...(config.cids || []),
    ]);
    for (const [i, config] of Object.entries(wConfig)) {
      _log(`\nW[${i}]`);
      if (!config?.alc || !config.aid || !config.gsid) {
        _setFailed();
        _err('缺少 alc / aid / gsid，请查看 README 并更新配置');
        continue;
      }
      const wClient = new WClient(config as WClientOptions);
      await wClient.signInAndGetGift(i);
    }
  }

  _log();

  // webhook
  if (_isFailed() && config.failedWebhook) {
    try {
      await Axios.get(config.failedWebhook);
    } catch (error) {
      _err('Webhook 调用失败');
      _err(error);
    }
  }
})();
