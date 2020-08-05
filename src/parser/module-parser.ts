/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {lex, parse, CharacterStream, D, Block} from "./mod.ts";
import {Dictionary, Errors, Logger, OS, SourceFile} from "../driver/mod.ts";

function parseNative(global: Block) {
    const parseNative = (x: string, name: string) => {
        const f: SourceFile = {
            path: name,
            fsPath: name,
            contents: x,
        };
        return parse(global, name, f);
    };

    const native = parseNative("", D.NativeModule);
    return [native];
}

async function parseModule(global: Block, modules: Dictionary<D.ModuleDef>, id: string, base: string, path: string) {
    Logger.info(`base: ${base}, id: ${id}, path: ${path}`);
    const f = await OS.readSourceFile(path);
    Logger.info(`Running: ${path} [${f.fsPath}]`);
    const m = parse(global, id, f);
    modules[m.blockID.hash] = m;
    for (const im of m.listImports()) {
        if (!modules[im.nodeID.hash]) {
            const name = m.resolveID(im.id);
            const mid = name.replaceAll(/\./g, "/");
            const ad = `${base}/${mid}`;
            const a1 = `${base}/${mid}/mod.ut`;
            const a2 = `${base}/${mid}.ut`;
            await parseModule(global, modules, name, base, OS.isDir(ad) ? a1 : a2);
        }
    }
    return m;
}

function getFileName(path: string) {
    const a = path.lastIndexOf("/") + 1;
    const b = path.lastIndexOf(".");
    Errors.ASSERT(a < b);
    return path.substring(a, b);
}

export async function parseFile(base: string, path: string): Promise<[Block, D.ModuleDef[]]> {
    const modules: Dictionary<D.ModuleDef> = {};
    const global = Block.build(Block.Global);
    const nms = parseNative(global);

    path = path.replaceAll(/\\/g, "/");
    const id = getFileName(path);
    base = base || path.substring(0, path.indexOf("/"));
    const m = await parseModule(global, modules, id, base, path);

    const mods: D.ModuleDef[] = [];
    mods.push(...nms);
    mods.push(m);
    mods.push(...Object.values(modules).filter(x => x.blockID.hash !== m.blockID.hash));
    return [global, mods];
}