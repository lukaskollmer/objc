#!/usr/bin/env node

const objc = require('../src/index');

const {
  NSFileManager,
  NSString,
  NSURL
} = objc;



// the newly created ObjC class is available as `objc.FileManagerDelegate`
objc.defineClass('FileManagerDelegate', 'NSObject', {
  // type encodings
  fileManager_shouldMoveItemAtPath_toPath_: 'c40@0:8@16@24@32',
}, {
  // methods
  
  fileManager_shouldMoveItemAtPath_toPath_: (self, cmd, fileManager, srcPath, dstPath) => {
    console.log('calling: -[NSFileManagerDelegate fileManager:shouldMoveItemAtPath:toPath:]');
    return 1;
  },
  
});




const fm = NSFileManager.new();
const delegate = objc.FileManagerDelegate.new();
fm.setDelegate_(delegate);


const pathA = 'x.txt';
const pathB = 'y.txt';


// create file
const data = objc.ns('hello world').dataUsingEncoding_(4);
fm.createFileAtPath_contents_attributes_(pathA, data, null);


// move file
fm.moveItemAtPath_toPath_error_(pathA, pathB, null);


// delete file
let url = NSURL.fileURLWithPath_(pathB);
fm.trashItemAtURL_resultingItemURL_error_(url, null, null);
