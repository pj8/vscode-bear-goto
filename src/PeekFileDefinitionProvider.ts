import * as vscode from 'vscode';
import * as parsePath from 'parse-path';

export default class PeekFileDefinitionProvider implements vscode.DefinitionProvider {
  targetFileExtensions: string[] = [];
  resourceAppPaths: string[] = [];
  resourcePagePaths: string[] = [];

  constructor(targetFileExtensions: string[] = [], resourceAppPaths: string[] = [], resourcePagePaths: string[] = []) {
    this.targetFileExtensions = targetFileExtensions;
    this.resourceAppPaths = resourceAppPaths;
    this.resourcePagePaths = resourcePagePaths;
  }

  getResourceNameAndMethod(document: vscode.TextDocument, position: vscode.Position): any[] {
    const range = document.getWordRangeAtPosition(position, /((get|post|put|delete|resource)?\(?['"]([^'"]*?)['"])/);
    const selectedText = document.getText(range);
    const resourceParts = selectedText.match(/(get|post|put|delete|resource)?\(?['"](app|page):\/\/self\/(.*)['"]/);
    if (resourceParts === null) { return []; }
    const appOrPage = resourceParts[2];
    const replaced = parsePath(resourceParts[3]).pathname.replace('{', '');
    const slashed = replaced.split("/").map(x => x.charAt(0).toUpperCase() + x.slice(1)).join("/");
    const dashed = slashed.split("-").map(x => x.charAt(0).toUpperCase() + x.slice(1)).join("");
    const method = "on" + resourceParts[1].charAt(0).toUpperCase() + resourceParts[1].slice(1);

    let file = '';
    const possibleFileNames: any[] = [];
    if (appOrPage === 'app') {
      this.resourceAppPaths.forEach((resourceAppPath) => {
        this.targetFileExtensions.forEach((ext) => {
          file = resourceAppPath + "/" + dashed;
          possibleFileNames.push({
            file : file + ext,
            method : method
          });
        });
      });
    } else {
      this.resourcePagePaths.forEach((resourcePagePath) => {
        this.targetFileExtensions.forEach((ext) => {
          file = resourcePagePath + "/" + dashed;
          possibleFileNames.push({
            file : file + ext,
            method : method
          });
          possibleFileNames.push({
            file : file + '/Index' + ext,
            method : method
          });
        });
      });
    }

    return possibleFileNames;
  }

  searchFilePath(fileName: String): Thenable<vscode.Uri[]> {
    return vscode.workspace.findFiles(`**/${fileName}`, "**/vendor"); // Returns promise
  }

  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<any[] | vscode.Location | vscode.Location[] | undefined> {
    const resourceNameAndMethods = this.getResourceNameAndMethod(document, position);
    const searchPathActions = resourceNameAndMethods.map(async resourceNameAndMethod => {

      const files = await this.searchFilePath(resourceNameAndMethod.file);
      return files.map(file => {
        return {
          file: file,
          method: resourceNameAndMethod.method
        };
      });
    });
    const searchPromises = Promise.all(searchPathActions); // pass array of promises
    const paths = await searchPromises;

    // @ts-ignore
    const filePaths: any[] = [].concat.apply([], paths);
    if (!filePaths.length) {
      return undefined;
    }

    const allPaths: any[] = [];
    for (const filePath of filePaths) {
      const document = await vscode.workspace.openTextDocument(filePath.file.path);
      const fileContent = document.getText();
      const lines = fileContent.split('\n');
      for (let line = 0; line < lines.length; line++) {
          if (lines[line].includes(filePath.method)) {
              allPaths.push(new vscode.Location(vscode.Uri.file(filePath.file.path), new vscode.Position(line, 0)));
              break;
          }
      }
    }

    return allPaths;
  }
}