//
// Created by Lukas Kollmer on 17.04.17.
//

#ifndef OBJC_UTILS_H
#define OBJC_UTILS_H

#include <node.h>
#include <v8.h>

const char *ValueToChar(v8::Isolate *isolate, v8::Local<v8::Value> val);

#define EQUAL(s1, s2) strcmp(s1, s2) == 0

#endif //OBJC_UTILS_H
