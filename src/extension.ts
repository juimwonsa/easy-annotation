import * as vscode from "vscode";
import { TextMateService } from "./textmate.service";

let textMateService: TextMateService | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('[Easy Annotation] "easy-annotation" is now activating!');

  try {
    // oniguruma WASM 로딩은 비동기이므로, 서비스 생성자 또는 별도 init 메소드에서 await 처리하거나
    // onigLibPromise가 준비될 때까지 기다리는 로직이 필요할 수 있습니다.
    // 위 TextMateService의 initializeOnigLib는 Promise를 반환하므로,
    // Registry 생성자에 이 Promise를 직접 전달하면 vscode-textmate가 내부적으로 await합니다.
    textMateService = new TextMateService(context);
    console.log("[Easy Annotation] TextMateService instance created.");
  } catch (error) {
    console.error(
      "[Easy Annotation] Failed to initialize TextMateService during activation:",
      error
    );
    vscode.window.showErrorMessage(
      "Easy Annotation: Failed to initialize TextMate service. Language detection might not work."
    );
    return;
  }

  let disposable = vscode.commands.registerCommand(
    "easy-annotation.toggleComment",
    async () => {
      const editor = vscode.window.activeTextEditor;
      // ... (이전 답변의 나머지 명령어 로직은 동일하게 적용) ...
      // 예시:
      if (!editor) {
        vscode.window.showWarningMessage(
          "No active text editor for Easy Annotation."
        );
        return;
      }
      if (!textMateService) {
        vscode.window.showErrorMessage(
          "Easy Annotation: TextMate service is not available."
        );
        // 서비스가 제대로 초기화되지 않았을 수 있으므로, 여기서 다시 시도하거나 사용자에게 알림
        try {
          console.log(
            "[Easy Annotation] Attempting to re-initialize TextMateService in command."
          );
          textMateService = new TextMateService(context); // 재시도 (주의: activate에서 이미 실패했다면 의미 없을 수 있음)
          if (!textMateService) throw new Error("Re-initialization failed");
        } catch (error) {
          console.error(
            "[Easy Annotation] Failed to re-initialize TextMateService in command:",
            error
          );
          await vscode.commands.executeCommand("editor.action.commentLine"); // 기본 기능으로 폴백
          return;
        }
      }

      const document = editor.document;
      const position = editor.selection.active;

      if (document.languageId !== "html") {
        await vscode.commands.executeCommand("editor.action.commentLine");
        return;
      }

      let scopes: string[] | null = null;
      try {
        scopes = await textMateService.getScopesAtPosition(document, position);
      } catch (error) {
        console.error(
          "[Easy Annotation] Error getting scopes from TextMateService:",
          error
        );
        vscode.window.showErrorMessage(
          "Easy Annotation: Error determining language context."
        );
        await vscode.commands.executeCommand("editor.action.commentLine");
        return;
      }

      let useJsComments = false;
      let useCssComments = false;
      if (scopes && scopes.length > 0) {
        console.log(
          `[Easy Annotation] Scopes at L${position.line + 1}:C${
            position.character + 1
          }: ${scopes.join(", ")}`
        );
        if (
          scopes.some(
            (scope) =>
              scope.toLowerCase().includes("javascript") ||
              scope.toLowerCase().includes("source.js")
          )
        ) {
          useJsComments = true;
        } else if (
          scopes?.some(
            (scope) =>
              scope.toLowerCase().includes("css") ||
              scope.toLowerCase().includes("source.css")
          )
        ) {
          useCssComments = true;
        }
      } else {
        console.log(
          `[Easy Annotation] No specific scopes found at L${
            position.line + 1
          }:C${position.character + 1}, defaulting to HTML comment.`
        );
      }

      // --- 중요: 플래그 값 확인 로그 추가 ---
      console.log(
        `[Easy Annotation] Determined flags before applying comments: useJsComments = ${useJsComments}, useCssComments = ${useCssComments}`
      );
      // ------------------------------------

      if (useJsComments) {
        await editor.edit(
          (editBuilder) => {
            editor.selections.forEach((selection) => {
              const startLine = selection.start.line;
              const endLine = selection.end.line;
              for (let i = startLine; i <= endLine; i++) {
                if (
                  selection.isEmpty ||
                  (i >= selection.start.line && i <= selection.end.line)
                ) {
                  const line = document.lineAt(i);
                  const trimmedLineText = line.text.trim();
                  const nonWhitespaceStartIndex =
                    line.firstNonWhitespaceCharacterIndex;
                  if (trimmedLineText.startsWith("//")) {
                    const commentStartIndex = line.text.indexOf("//");
                    let lengthToRemove = 2;
                    if (line.text.charAt(commentStartIndex + 2) === " ") {
                      lengthToRemove = 3;
                    }
                    editBuilder.delete(
                      new vscode.Range(
                        i,
                        commentStartIndex,
                        i,
                        commentStartIndex + lengthToRemove
                      )
                    );
                  } else if (!line.isEmptyOrWhitespace) {
                    editBuilder.insert(
                      new vscode.Position(i, nonWhitespaceStartIndex),
                      "// "
                    );
                  } else if (
                    selection.isSingleLine &&
                    line.isEmptyOrWhitespace
                  ) {
                    editBuilder.insert(
                      new vscode.Position(i, nonWhitespaceStartIndex),
                      "// "
                    );
                  }
                }
              }
            });
          },
          { undoStopBefore: true, undoStopAfter: true }
        );
        console.log("[Easy Annotation] Applied JavaScript style comment.");
      } else if (useCssComments) {
        await editor.edit(
          (editBuilder) => {
            editor.selections.forEach((selection) => {
              const startLine = selection.start.line;
              const endLine = selection.end.line;

              for (let i = startLine; i <= endLine; i++) {
                if (
                  selection.isEmpty ||
                  (i >= selection.start.line && i <= selection.end.line)
                ) {
                  const line = document.lineAt(i);
                  const lineText = line.text; // 원본 텍스트 유지 중요
                  const trimmedLineText = lineText.trim();
                  const nonWhitespaceStartIndex =
                    line.firstNonWhitespaceCharacterIndex;
                  const leadingWhitespace = lineText.substring(
                    0,
                    nonWhitespaceStartIndex
                  );

                  // 이미 CSS 주석 처리된 라인인지 확인 (앞뒤 공백 제외)
                  if (
                    trimmedLineText.startsWith("/*") &&
                    trimmedLineText.endsWith("*/")
                  ) {
                    // 주석 제거: "/* 내용 */" -> "내용"
                    // 앞뒤 "/* " 와 " */" 또는 "/*"와 "*/" 제거
                    let uncommentedText = trimmedLineText
                      .substring(2, trimmedLineText.length - 2)
                      .trim();
                    // 만약 원래 "/*내용*/" 이었다면 " 내용 "을 제거할 필요 없음.
                    // 단순하게는 앞 2글자, 뒤 2글자 제거 후 trim
                    editBuilder.replace(
                      line.range,
                      leadingWhitespace + uncommentedText
                    );
                  } else if (!line.isEmptyOrWhitespace) {
                    // 주석 추가: "내용" -> "/* 내용 */"
                    editBuilder.replace(
                      line.range,
                      `${leadingWhitespace}/* ${trimmedLineText} */`
                    );
                  } else if (
                    selection.isSingleLine &&
                    line.isEmptyOrWhitespace
                  ) {
                    // 단일 빈 라인 선택 시 주석 추가
                    editBuilder.replace(
                      line.range,
                      `${leadingWhitespace}/* */`
                    );
                  }
                  // 여러 줄 선택 시 빈 라인은 주석 처리 안함 (필요 시 로직 추가)
                }
              }
            });
          },
          { undoStopBefore: true, undoStopAfter: true }
        );
        console.log("[Easy Annotation] Applied CSS style comment.");
      } else {
        await vscode.commands.executeCommand("editor.action.commentLine");
        console.log("[Easy Annotation] Applied HTML style comment (default).");
      }
    }
  );

  context.subscriptions.push(disposable);
  console.log('[Easy Annotation] "easy-annotation" activation completed.');
}

export function deactivate() {
  console.log('[Easy Annotation] "easy-annotation" is now deactivated.');
}
