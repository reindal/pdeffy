const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
//const packageJson = require('./package.json');

module.exports = {
  packagerConfig: {
    name: 'Pdeffy',
    icon: 'assets/icon',
    asar: true,
    executableName: 'pdeffy',
    ignore: [
      /node_modules[/\\](canvas|sqlite3|better-sqlite3|node-gyp)/,
    ],
  },
  hooks: {
    generateAssets: async (forgeConfig, platform) => {
      if (platform === 'win32') {
        forgeConfig.packagerConfig.extraResource = [
          'resources/ghostscript/win'
        ];
      }
    }
  },
  rebuildConfig: {
    enabled: false,
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
          setupExe: 'pdeffySetup-latest.exe',
          setupIcon: 'assets/logo/ico/256x256.ico',
          loadingGif: 'assets/loadingInstaller.gif',
          iconUrl: 'https://raw.githubusercontent.com/reindal/pdeffy/refs/heads/main/assets/logo/ico/256x256.ico',
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        icon: 'assets/icon.icns',
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          // Linux requires a PNG image for the system launcher icon
          icon: 'assets/logo/png/256x256.png'
        }
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          // Linux requires a PNG image for the system launcher icon
          icon: 'assets/logo/png/256x256.png'
        }
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
