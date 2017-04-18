//
// Created by Lukas Kollmer on 17.04.17.
//

#include "utils.h"

const char *ValueToChar(Isolate *isolate, Local<Value> val) {
    if(!val->IsString()){
        isolate->ThrowException(Exception::TypeError(String::NewFromUtf8(isolate, "Argument Must Be A String")));
        return NULL;
    }

    String::Utf8Value val_string(val);
    char * val_char_ptr = (char *) malloc(val_string.length() + 1);
    strcpy(val_char_ptr, *val_string);
    return val_char_ptr;
}
