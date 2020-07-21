/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    CharacterStream, Dictionary,
    SourceFile, Token, TokenType, Location
} from "./common.ts"
import * as Logger from "./logger.ts";
import lex from "./lexer.ts";

export default function parse(f: SourceFile) {
    Logger.info(`Parsing: ${f.path}`);
    const cs = CharacterStream.build(f.contents);
    const ts = lex(cs);
    console.log(ts);
}