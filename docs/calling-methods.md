# Calling methods

When calling Objective-C methods, all you need to do is replace all colons in the selector with underscores.

For example, this Objective-C code:

```objc
#import <AppKit/AppKit.h>

NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
[pasteboard declareTypes:@[NSPasteboardTypeString] owner:nil];

[pasteboard setString:@"44 > 45" forType:NSPasteboardTypeString];
```

is equivalent to the following JavaScript code:

```js
const {NSPasteboard, NSPasteboardTypeString} = require('objc');

let pasteboard = NSPasteboard.generalPasteboard();
pasteboard.declareTypes_owner_([NSPasteboardTypeString], null);

pasteboard.setString_forType_("44 > 45", NSPasteboardTypeString);
```

