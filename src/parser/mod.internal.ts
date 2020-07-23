/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import CharacterStream from "./CharacterStream.ts";
import TokenStream from "./TokenStream.ts";
import lex from "./lexer.ts";
import { Location } from "./mod.ts";

export enum TokenType {
    TK_WHITESPACE = 128,
    TK_COMMENT,
    TK_ID,
    TK_TYPE,
    TK_STRING_LITERAL,
    TK_BOOLEAN_LITERAL,
    TK_BINARY_NUMBER_LITERAL,
    TK_OCTAL_NUMBER_LITERAL,
    TK_DECIMAL_NUMBER_LITERAL,
    TK_HEXADECIMAL_NUMBER_LITERAL,
    TK_INTERNAL
}

export interface Token {
    type: TokenType,
    loc: Location,
    lexeme: string,
}

export {
    CharacterStream,
    TokenStream,
    lex,
};