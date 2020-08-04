/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
export default class OS {
    static panic(msg: string) {
        console.log(msg);
        return Deno.exit(1);
    }

    static async readSourceFile(path: string) {
        const decoder = new TextDecoder()
        let x = decoder.decode(await Deno.readFile(path));
        x = x.replaceAll(/\r\n?/g, "\n");
        x = x.charAt(x.length - 1) === "\n" ? x :  x + "\n";

        return  {
            path: path,
            fsPath: await Deno.realPath(path),
            contents: x,
        };
    }

    static writeBinaryFile(path: string, xs: Uint8Array) {
        Deno.writeFileSync(path, xs);
    }

    static isDir(path: string) {
        try {
            return Deno.statSync(path).isDirectory;
        }
        catch (e) {
            if (e instanceof Deno.errors.NotFound) {
                return false;
            }
            throw e;
        }
    }
}