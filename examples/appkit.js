'use strict';

const objc = require('../src/index');

objc.import('AppKit');

const {
  NSApplication,
} = objc;

// For app lifecycle, refer to:
// https://github.com/TooTallNate/NodObjC/blob/master/examples/NodeCocoaHelloWorld.app/Contents/MacOS/app.js

const AppDelegate = objc.createClass('AppDelegate', 'NSObject', {
  'applicationWillBecomeActive:': (self, cmd, notification) => {
    console.log('-[UIApplicationDelegate applicationWillBecomeActive:]');
  },
  'applicationDidFinishLaunching:': (self, cmd, notification) => {
    console.log('-[UIApplicationDelegate application:didFinishLaunchingWithOptions:]');
    return 1;
  },
  'application:willFinishLaunchingWithOptions:': (self, cmd, application, options) => {
    console.log('-[UIApplicationDelegate application:willFinishLaunchingWithOptions:]');
  },
  'application:didFinishLaunchingWithOptions:': (self, cmd, application, options) => {
    console.log('-[UIApplicationDelegate application:didFinishLaunchingWithOptions:]');
    return 1;
  },

  _encodings: {
    'applicationWillBecomeActive:': ['v', ['@', ':', '@']],
    'applicationDidFinishLaunching:': ['v', ['@', ':', '@']],
    'application:willFinishLaunchingWithOptions:': ['v', ['@', ':', '@', '@']],
    'application:didFinishLaunchingWithOptions:': ['c', ['@', ':', '@', '@']],
  }
});
const delegate = AppDelegate.new();

const app = NSApplication.sharedApplication();

// I can't get the symbol 'NSApplicationActivationPolicyRegular', somehow...
// app.setActivationPolicy(objc.NSApplicationActivationPolicyRegular);

// Until get/set is implemented, we can achieve the same using setDelegate().
app.setDelegate_(delegate);

// TODO: convert this NSArray<NSString*> to char*[] and pass it into
// NSApplicationMain. We might need ref-array-napi for this.
// https://github.com/Janealter/ref-array-napi
// const argv = objc.NSProcessInfo.new().arguments();

// Not sure why I can't get NSApplicationMain via objc.NSApplicationMain...
// const dynamicLib = new require('ffi-napi').Library(null, {
//   NSApplicationMain: ['int', ['int', 'string']],
// });

// Run the app. For now, we effectively pass no args. We have to read
// NSApplicationMain from our dynamicLib because it's a method, not a class, so
// won't be found by objc_getClass (which the objc library calls internally).
// dynamicLib.NSApplicationMain(0, '');

// NSApplicationMain doesn't seem to result in the application launch methods
// getting called, so we'll use this run method instead (sadly ignoring the CLI
// args passed in). We can refer to the CLI args by closing over them, anyway.
app.run();
