/**
 * tsdraw app version, shown next to the title and in the browser tab.
 * Bump it with every change so the running page shows which code it has: 0.01, 0.02, ...
 */
import licenseText from '../../LICENSE?raw';

export const APP_VERSION = '0.20';

/** Set by Vite at build time (vite.app.config.ts `define`); absent in tests. */
declare const __TSDRAW_BUILD_TIME__: string | undefined;

/** When this copy was built (dev server: when it started). */
export const APP_BUILD: string =
  typeof __TSDRAW_BUILD_TIME__ !== 'undefined' && __TSDRAW_BUILD_TIME__ ? __TSDRAW_BUILD_TIME__ : 'development';

/** Shown in Help › About. `notice` is the short statement; `text` the full license (the LICENSE file). */
export const APP_LICENSE = {
  name: 'GNU General Public License v2.0 (GPL-2.0-only)',
  copyright: `Copyright © ${new Date().getFullYear()} Zhaowen Luo`,
  notice:
    'TSDraw is free software: you can redistribute it and/or modify it under the terms of the GNU General ' +
    'Public License, version 2, as published by the Free Software Foundation.\n\n' +
    'This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even ' +
    'the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public ' +
    'License for more details.',
  text: licenseText,
};
