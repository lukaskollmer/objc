//
// Created by Lukas Kollmer on 17.04.17.
//

#include "utils.h"

const char *ValueToChar(v8::Isolate *isolate, v8::Local<v8::Value> val) {
    if(!val->IsString()){
        isolate->ThrowException(v8::Exception::TypeError(v8::String::NewFromUtf8(isolate, "Argument Must Be A String")));
        return NULL;
    }

    v8::String::Utf8Value val_string(val);
    char * val_char_ptr = (char *) malloc(val_string.length() + 1);
    strcpy(val_char_ptr, *val_string);
    return val_char_ptr;
}
