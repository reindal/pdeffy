const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
//const packageJson = require('./package.json');

module.exports = {
  packagerConfig: {
    asar: true,
    ignore: [
      /node_modules[/\\](canvas|sqlite3|better-sqlite3|node-gyp)/,
    ],
  },
  rebuildConfig: {
    enabled: false,
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
          certificateFile: './electronDemoPdf.pfx',
          certificatePassword: process.env.CERTIFICATE_PASSWORD,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
    /*{
      name: '@electron-forge/maker-wix',
      config: {
        name: `Pdeffy`,
        exe: `pdeffy.exe`,
        icon: "assets/icon.ico",
        features: {
            autoUpdate: true,
            autoLaunch: true,
          },
        ui: {
          chooseDirectory: true,
          images: {
            background: path.join(__dirname, "assets", "installerBackground.jpg"),
            banner: path.join(__dirname, "assets", "installerBanner.jpg"),
          },
      },
      },
    },*/
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
