/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    CharacterStream,
    TokenType,
    Token,
    TokenStream,
} from "./mod.internal.ts";
import {
    Errors,
    Dictionary,
} from "../util/mod.ts";

const Lower = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];
const Upper = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
const Digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const Whitespace = [" ", "\t", "\n"];
const UniSym = ["(", ")", "{", "}", "[", "]", ":", ";", ",", "=", "#", "+", "-", "*", "/", "%", "<", ">", "!", "&", "|", "."];
type ReadToken = (cs: CharacterStream) => Token;

function toMap(xs: string[]) {
    const d : Dictionary<boolean> = {}
    xs.forEach(x => d[x] = true);
    return d;
}

const DecDigits = toMap(["_"].concat(Digits));
const HexDigits = toMap(["_", "a", "b", "c", "d", "e", "f", "A", "B", "C", "D", "E", "F"].concat(Digits));
const BinDigits = toMap(["_", "0", "1"]);
const OctDigits = toMap(["_", "0", "1", "2", "3", "4", "5", "6", "7"]);
const IDChar = toMap(["_", "-"].concat(Lower).concat(Upper).concat(Digits));
const TypeChar = IDChar;
const WhitespaceChar = toMap(Whitespace);
const BooleanLiterals = toMap(["true", "false"]);

const LexerDispatch = (() => {
    const d : Dictionary<ReadToken> = {}
    for (const x of Lower) {
        d[x] = readID;
    }

    for (const x of Upper) {
        d[x] = readType;
    }

    for (const x of Digits) {
        d[x] = readNumber;
    }

    for (const x of Whitespace) {
        d[x] = readWhitespace;
    }

    for (const x of UniSym) {
        d[x] = readSymbol;
    }

    d['"'] = readString;
    d["/"] = readComment;

    return d;
})();

function readWhitespace(cs: CharacterStream) {
    const loc = cs.loc();
    while (!cs.eof() && WhitespaceChar[cs.next()]) {}
    if (!cs.eof()) cs.back();
    return cs.token(TokenType.TK_WHITESPACE, loc);
}

function readComment(cs: CharacterStream) {
    const loc = cs.loc();
    const delimiter = cs.next(); // = /
    try {
        const d2 = cs.next();
        if (d2 === "/") {
            while (cs.next() !== "\n") {}
            return cs.token(TokenType.TK_COMMENT, loc);
        }
        else if (d2 === "*") {
            // parse till next matching */
            for (;;) {
                const c = cs.next();
                if (c === "*") {
                    if (cs.next() === "/") {
                        return cs.token(TokenType.TK_COMMENT, loc);
                    }
                }
                else if (c === "/") {
                    if (cs.peek() === "*") {
                        cs.back();
                        readComment(cs);
                    }
                }
            }
        }
        else {
            cs.back();
            return cs.token(delimiter.codePointAt(0) as TokenType, loc);
        }
    }
    catch (e) {
        if (e instanceof Errors.EOF) {
            return Errors.Lexer.raiseUnbalancedComment(cs, loc);
        }
        else {
            throw e;
        }
    }
}

function readString(cs: CharacterStream) {
    const loc = cs.loc();
    const delimiter = cs.next();
    try {
        while (cs.next() !== delimiter) {}
        return cs.token(TokenType.TK_STRING_LITERAL, loc);
    }
    catch (e) {
        if (e instanceof Errors.EOF) {
            return Errors.Lexer.raiseUnterminatedString(cs, loc);
        }
        else {
            throw e;
        }
    }
}

function readID(cs: CharacterStream) {
    const loc = cs.loc();
    while (IDChar[cs.next()]) {}
    cs.back();
    const x = cs.token(TokenType.TK_ID, loc);
    if (BooleanLiterals[x.lexeme]) x.type = TokenType.TK_BOOLEAN_LITERAL;
    return x;
}

function readType(cs: CharacterStream) {
    const loc = cs.loc();
    while (TypeChar[cs.next()]) {}
    cs.back();
    return cs.token(TokenType.TK_TYPE, loc);
}

function readNumber(cs: CharacterStream) {
    const loc = cs.loc();

    const mustBeSeparator = () => {
        if (IDChar[cs.peek()]) {
            cs.next();
            Errors.Lexer.raiseInvalidNumber(cs, loc);
        }
    }

    let Char = DecDigits;
    let type = TokenType.TK_DECIMAL_NUMBER_LITERAL;
    let enableKilobyte = false;
    if (cs.next() === "0") {
        const x = cs.next();
        switch (x) {
            case "x": type = TokenType.TK_HEXADECIMAL_NUMBER_LITERAL; Char = HexDigits; break;
            case "b": type = TokenType.TK_BINARY_NUMBER_LITERAL; Char = BinDigits; break;
            case "o": type = TokenType.TK_OCTAL_NUMBER_LITERAL; Char = OctDigits; break;
            default: {
                if (Char[x]) {
                    Errors.Lexer.raiseInvalidDecimalNumber(cs, loc);
                }
                else if (IDChar[x]) {
                    Errors.Lexer.raiseInvalidNumber(cs, loc);
                }
                else {
                    cs.back();
                }
            }
        }

        switch (type) {
            case TokenType.TK_BINARY_NUMBER_LITERAL:
            case TokenType.TK_OCTAL_NUMBER_LITERAL:
            case TokenType.TK_HEXADECIMAL_NUMBER_LITERAL: {
                // must at least be be one of 0xN | 0oN | 0bN
                if (!Char[cs.next()]) {
                    Errors.Lexer.raiseInvalidNumber(cs, loc);
                }
                break;
            }
            default: {
                // ignore
            }
        }
    }
    else {
        enableKilobyte = true;
    }

    while (Char[cs.next()]) {}
    cs.back();
    if (enableKilobyte && cs.peek() === "K") {
        cs.next();
    }
    mustBeSeparator();
    return cs.token(type, loc);
}

function readSymbol(cs: CharacterStream) {
    const loc = cs.loc();
    const c = cs.next();
    return cs.token(c.codePointAt(0) as TokenType, loc);
}

export default function lex(cs: CharacterStream) {
    const xs = new Array<Token>();

    while (!cs.eof()) {
        const c = cs.peek();
        const f = LexerDispatch[c];
        if (f) {
            const tk = f(cs);
            if (tk.type === TokenType.TK_ID) {
                const p = xs.pop();
                const pp = xs.pop();
                if (p && pp && p.lexeme === "." && pp.type === TokenType.TK_ID) {
                    pp.type = TokenType.TK_MULTI_ID;
                    pp.xs.push(tk.lexeme);
                    xs.push(pp);
                }
                else if (p && pp && p.lexeme === "." && pp.type === TokenType.TK_MULTI_ID) {
                    pp.xs.push(tk.lexeme);
                    xs.push(pp);
                }
                else if (p && pp) {
                    xs.push(pp);
                    xs.push(p);
                    xs.push(tk);
                }
                else {
                    xs.push(tk);
                }
            }
            else {
                xs.push(tk);
            }
        }
        else {
            Errors.raiseDebug(`<${c}>`);
        }
    }
    return TokenStream.build(xs);
}