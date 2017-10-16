# Node.js React Native PouchDB demo
Peer-to-peer shared album app, based on Node.js on mobile running a PouchDB server, with a React Native interface.

This demo has an accompanying article: http://www.janeasystems.com/blog/node-js-meets-ios/

The app uses Node.js to set up a UDP broadcast communication layer that enables synchronization of the PouchDB database between all the peers on the local network.

It works on iOS 64-bit physical devices with iOS version 10.3 or higher. Specifically, iPhone 5s, SE and newer are supported, while iPhone 5, 5c and older are not. Support for the iPhone simulator is not included. 

## Structure

The `nodeproj` path contains the Node.js project, which is a single file `nodeproj/main.js` that can run on desktop platforms too, to have another PouchDB peer.

The `nodelibs` path contains the Node.js mobile library binaries.

The `ios` path contains the Xcode project to build and run the app for iOS devices.

The `index.ios.js` file in the root folder contains the main React Native file.

## Run the demo

For the demo to work, every instance must be connected to the same local network.

### Running on iOS device

To run the demo on iOS you need:
 - A macOS device with the latest Xcode with the iOS SDK version 10.3 or higher.
 - One or more physical iOS devices with arm64 architecture, running iOS version 10.3 or higher.
 - A valid Apple Developer Account.
 - Every iOS device should be connected to the same WiFi network.

Instructions:
 - Make sure you have the prerequisites for `react-native`:
   - Node `brew install node`
   - Watchman `brew install watchman`
   - React Native CLI `npm install -g react-native-cli`
 - Run the required npm and react-native commands to install the required node modules in the project root:
   - `npm install`
   - `react-native link`
 - Open the `ios/PouchAlbum.xcodeproj` project file in Xcode.
 - Select one of the physical iOS devices as the run target.
 - In the project settings (click on the project main node), in the `Signing` portion of the `General` tab, select a valid Team and handle the provisioning profile creation/update. If you get an error that the bundle identifier cannot be used, you can simply change the bundle identifier to a unique string by appending a few characters to it.
 - Run the app. If the build process doesn't start the app right away, you might have to go to `Settings>General` in the device and enter `Device Management` or `Profiles & Device Management` to manually accept the profile.

#### Using the Application away from your development machine

The default `Debug` configuration for iOS `react-native` apps needs to have access to a development server to load the `react-native` JS files. To make it easier to use our demo, the `Release` configuration should be already selected when you clone this project. [Instructions on how and why we did it can be found here.](https://facebook.github.io/react-native/docs/running-on-device.html#2-configure-release-scheme) This way, the `react-native` JS files will be packaged with the application instead of being loaded from the development server at runtime and the demo will be able to start without having to have network access to the development machine.

If you don't have a `Apple Developer Program` membership, take into consideration that a free account's provisioning profiles are only valid for a period of 7 days, after which the application will stop working and will have to be redeployed with an updated provisioning profile.

### Running on desktop
The `main.js` node script can also run on any desktop platform as a standalone Node.js app. All you have to do is install the node modules required and have node run the `nodeproj/main.js` file.

Inside the `nodeproj/` path, run:
```sh
npm install
node main.js
```

This will create another pouch peer that the mobile devices will also sync to.

## Known Issues

- PouchDB uses MemDOWN for the levelDB adapter, which stores the database in memory only, with no persistence between runs.
- We didn't spend much time in the "Getting real time photos from camera" portion, so you might notice that portrait photos end in landscape format, which is the React Native's `ImagePickerIOS` behaviour. We've noticed the camera might also not show any image on some some iOS devices, so we advise to use "Camera roll" images in the demo if that's your case.
- There is a significant performance improvement in the app start up time when using recent iPhone models (6s and 7).

## License
MIT.
