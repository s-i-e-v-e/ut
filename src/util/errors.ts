/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
export default class Errors {
    static InvalidNumber = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static InvalidToken = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static EOF = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnbalancedComment = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnterminatedString = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static Debug = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static raiseInvalidNumber(lexeme: string): never {
        throw new this.InvalidNumber(`Invalid number: ${lexeme}`);
    }

    static raiseInvalidDecimalNumber(lexeme: string): never {
        throw new this.InvalidNumber(`Decimal numbers cannot have leading zeros: ${lexeme}`);
    }

    static raiseInvalidToken(lexeme: string): never {
        throw new this.InvalidToken(`Invalid token: ${lexeme}`);
    }

    static raiseUnbalancedComment(lexeme: string): never {
        throw new this.UnbalancedComment(`Unbalanced comment: ${lexeme}`);
    }

    static raiseUnterminatedString(lexeme: string): never {
        throw new this.UnterminatedString(`Unterminated string: ${lexeme}`);
    }

    static raiseEOF(): never {
        throw new this.EOF("EOF");
    }

    static raiseDebug(msg?: string): never {
        throw new this.Debug(msg || "DebugError");
    }
}