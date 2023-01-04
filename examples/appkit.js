'use strict';

const objc = require('../src/index');

objc.import('AppKit');

const {
  NSApplication,
  NSColor,
  NSTextView,
  NSWindow,
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
app.setActivationPolicy(0);

// Until get/set is implemented, we can achieve the same using setDelegate().
app.setDelegate_(delegate);

// TODO: convert this NSArray<NSString*> to char*[] and pass it into
// NSApplicationMain. We might need ref-array-napi for this.
// https://github.com/Janealter/ref-array-napi
// const argv = objc.NSProcessInfo.new().arguments();

// Not sure why I can't get NSApplicationMain via objc.NSApplicationMain...
// const lib = new ffi.Library(null, {
//   NSApplicationMain: ['int', ['int', 'string']],
// });

// Run the app. For now, we effectively pass no args. We have to read
// NSApplicationMain from our dynamicLib because it's a method, not a class, so
// won't be found by objc_getClass (which the objc library calls internally).
// lib.NSApplicationMain(0, '');

// FIXME: as various symbol lookups are failing, maybe best to refer back to how
// NodObjC does it:
// https://github.com/TooTallNate/NodObjC/blob/e4710fb8b73d3a2860de1e959e335a6de3e2191c/lib/import.js#L147

const CGFloat = objc.types.double;
const CGPoint = objc.defineStruct('CGPoint', {
  x: CGFloat,
  y: CGFloat
});

const CGSize = objc.defineStruct('CGSize', {
  width: CGFloat,
  height: CGFloat
});

const CGRect = objc.defineStruct('CGRect', {
  origin: CGPoint,
  size: CGSize
});

const win = NSWindow.alloc().initWithContentRect_styleMask_backing_defer_(
  CGRect.new(
    CGPoint.new(0, 0),
    CGSize.new(200, 200),
  ),
  // Failing to look up these symbols.
  // objc.NSTitledWindowMask | objc.NSResizableWindowMask | objc.NSClosableWindowMask
  1 << 0 | 1 << 3 | 1 << 1,
  // objc.NSBackingStoreBuffered
  2,
  false,
);
win.setAlphaValue_(0);
win.cascadeTopLeftFromPoint_(CGPoint.new(20, 20));
win.setTitle_('Hello, World');
win.makeKeyAndOrderFront_(win);
win.center();
win.setBackgroundColor_(NSColor.greenColor());
win.animator().setAlphaValue_(1);

const textV = NSTextView.alloc().initWithFrame_(
  CGRect.new(
    CGPoint.new(0, 100),
    CGSize.new(100, 100),
  )
);

// textV.setAutoresizingMask(objc.NSViewWidthSizable | objc.NSViewMinYMargin);
textV.setAutoresizingMask_(2 | 8);
win.contentView().addSubview(textV);

// NSApplicationMain doesn't seem to result in the application launch methods
// getting called, so we'll use this run method instead (sadly ignoring the CLI
// args passed in). We can refer to the CLI args by closing over them, anyway.
app.activateIgnoringOtherApps_(true);
app.run();
