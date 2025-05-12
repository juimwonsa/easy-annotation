import * as fs from "node:fs/promises"; // Node.js fs.promises 사용
import * as path from "path";
import * as vscode from "vscode";
import {
  Registry,
  IGrammar,
  IRawGrammar,
  parseRawGrammar,
  IOnigLib,
  INITIAL,
} from "vscode-textmate";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma"; // vscode-oniguruma에서 가져옴

let onigLibPromiseCache: Promise<IOnigLib> | null = null;

function initializeOnigLib(extensionPath: string): Promise<IOnigLib> {
  if (!onigLibPromiseCache) {
    // 확장이 설치된 경로 내의 node_modules에서 onig.wasm 파일을 찾습니다.
    const wasmPath = path.join(
      extensionPath,
      "node_modules",
      "vscode-oniguruma",
      "release",
      "onig.wasm"
    );

    onigLibPromiseCache = fs
      .readFile(wasmPath)
      .then((wasmBuffer) => loadWASM(wasmBuffer.buffer)) // ArrayBuffer를 전달해야 할 수 있음
      .then(() => {
        console.log(
          "[Easy Annotation] Oniguruma WASM loaded successfully from:",
          wasmPath
        );
        return {
          createOnigScanner(sources: string[]): OnigScanner {
            return new OnigScanner(sources);
          },
          createOnigString(str: string): OnigString {
            return new OnigString(str);
          },
        };
      })
      .catch((error) => {
        console.error(
          `[Easy Annotation] Failed to load Oniguruma WASM from ${wasmPath}:`,
          error
        );
        onigLibPromiseCache = null; // 실패 시 캐시 비우기
        throw error; // 에러를 다시 던져서 서비스 초기화 실패를 알림
      });
  }
  return onigLibPromiseCache;
}

export class TextMateService {
  private registry: Registry;
  private scopeToGrammarPath: Map<string, string> = new Map();
  private initialGrammarScope: string | null = null;
  private grammarCache: Map<string, IGrammar> = new Map();

  constructor(private context: vscode.ExtensionContext) {
    this.registry = new Registry({
      onigLib: initializeOnigLib(context.extensionPath),
      loadGrammar: async (
        scopeName: string
      ): Promise<IRawGrammar | null | undefined> => {
        const relativeGrammarPath = this.scopeToGrammarPath.get(scopeName);
        if (relativeGrammarPath) {
          try {
            // context.extensionPath를 사용하여 확장에 포함된 syntaxes 폴더 내 파일 읽기
            const absoluteGrammarPath = path.join(
              this.context.extensionPath,
              relativeGrammarPath
            );
            const fileContents = await fs.readFile(absoluteGrammarPath, {
              encoding: "utf-8",
            });
            console.log(
              `[Easy Annotation] Loading grammar for ${scopeName} from ${absoluteGrammarPath}`
            );
            return parseRawGrammar(
              fileContents,
              path.basename(absoluteGrammarPath)
            );
          } catch (error) {
            console.error(
              `[Easy Annotation] Error loading grammar for ${scopeName} from ${relativeGrammarPath}:`,
              error
            );
            return null;
          }
        }
        console.warn(
          `[Easy Annotation] No grammar path found for scope ${scopeName}`
        );
        return null;
      },
    });

    // 문법 파일과 스코프 이름 매핑 (프로젝트 루트의 syntaxes 폴더 기준 상대 경로)
    this.scopeToGrammarPath.set(
      "text.html.basic",
      "syntaxes/html.tmLanguage.json"
    );
    this.scopeToGrammarPath.set(
      "source.js",
      "syntaxes/javascript.tmLanguage.json"
    );
    this.scopeToGrammarPath.set("source.css", "syntaxes/css.tmLanguage.json");
    // CSS 등 다른 주입되는 언어가 있다면 추가 등록 필요

    this.initialGrammarScope = "text.html.basic";
    console.log("[Easy Annotation] TextMateService initialized.");
  }

  private async initializeGrammar(scopeName: string): Promise<IGrammar | null> {
    if (this.grammarCache.has(scopeName)) {
      return this.grammarCache.get(scopeName)!;
    }
    console.log(`[Easy Annotation] Initializing grammar for ${scopeName}`);
    try {
      const grammar = await this.registry.loadGrammar(scopeName);
      if (grammar) {
        this.grammarCache.set(scopeName, grammar);
        console.log(
          `[Easy Annotation] Grammar for ${scopeName} initialized and cached.`
        );
      } else {
        console.error(
          `[Easy Annotation] Failed to load grammar for ${scopeName} (grammar is null).`
        );
      }
      return grammar;
    } catch (error) {
      console.error(
        `[Easy Annotation] Failed to initialize grammar for ${scopeName}:`,
        error
      );
      return null;
    }
  }

  // getScopesAtPosition 메소드는 이전 답변과 동일하게 유지됩니다.
  // (내부에서 this.initializeGrammar 호출, INITIAL 상수 사용 등)
  public async getScopesAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<string[] | null> {
    if (!this.initialGrammarScope) {
      console.error("[Easy Annotation] Initial grammar scope not set.");
      return null;
    }

    try {
      const grammar = await this.initializeGrammar(this.initialGrammarScope);
      if (!grammar) {
        console.error(
          `[Easy Annotation] Could not get grammar for ${this.initialGrammarScope} in getScopesAtPosition.`
        );
        return null;
      }

      let ruleStack = INITIAL; // vscode-textmate.INITIAL 사용
      for (let i = 0; i <= position.line; i++) {
        const line = document.lineAt(i);
        if (line.text.length > 10000) {
          console.warn(
            `[Easy Annotation] Line ${i + 1} is too long (${
              line.text.length
            } chars), skipping tokenization for this line.`
          );
          if (i === position.line) return [this.initialGrammarScope];
          continue;
        }
        const lineTokens = grammar.tokenizeLine(line.text, ruleStack);
        ruleStack = lineTokens.ruleStack;

        if (i === position.line) {
          for (const token of lineTokens.tokens) {
            if (
              position.character >= token.startIndex &&
              position.character < token.endIndex
            ) {
              return token.scopes;
            }
          }
          if (lineTokens.tokens.length > 0) {
            const lastToken = lineTokens.tokens[lineTokens.tokens.length - 1];
            if (position.character >= lastToken.endIndex) {
              return lastToken.scopes;
            }
            if (position.character < lineTokens.tokens[0].startIndex) {
              return [this.initialGrammarScope];
            }
          }
          return [this.initialGrammarScope];
        }
      }
    } catch (error) {
      console.error(
        "[Easy Annotation] Error tokenizing line or loading grammar:",
        error
      );
    }
    return null;
  }
}
