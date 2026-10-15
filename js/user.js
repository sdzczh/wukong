/* 用户模块：本地用户名，仅存存档，无账号/云同步体系 */
'use strict';

const User = {
  has() { return !!Save.data.username; },
  get() { return Save.data.username || ''; },
  /* 设置名号：去空白、限 8 字，空则默认「无名氏」 */
  set(name) {
    Save.data.username = String(name || '').trim().slice(0, 8) || '无名氏';
    Save.write();
    return Save.data.username;
  },
};
