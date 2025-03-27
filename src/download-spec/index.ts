#!/usr/bin/env node
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function downloadSpecFile(options: any) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answers: string[] = []; // 답변을 저장할 배열
  const defaultAnswers: string[] = ['http://localhost:8000/openapi.json', './src/lib/fetch-client']; // 기본답변을 저장할 배열

  const questions = [
    'openapi 명세 파일을 다운로드 받을 수 있는 url을 입력하세요. ( ex. http://localhost:8000/openapi.json ) ',
    '결과파일이 저장될 경로를 입력하세요 ( ex. ./src/lib/fetch-client )',
  ];

  try {
    await askQuestion(0);
  } catch (error) {
    // askQuestion 또는 processAnswers에서 발생한 캐치되지 않은 에러 처리
    console.error('\n\n스크립트 실행 중 예상치 못한 오류가 발생했습니다:');
    console.error(error);
  } finally {
    rl.close(); // 모든 작업 완료 또는 에러 발생 시 readline 인터페이스 종료
    console.log('\n스크립트를 종료합니다.');
  }

  // rl.question을 프로미스화하는 헬퍼 함수
  const questionAsync = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  async function askQuestion(index: number) {
    if (index >= questions.length) {
      // 모든 질문이 완료된 경우
      await processAnswers();
      rl.close();
      return;
    }

    // rl.question 대신 프로미스화된 함수 사용
    const answer = await questionAsync(questions[index] + ' ');
    answers.push(answer || defaultAnswers[index]);
    await askQuestion(index + 1); // 다음 질문 (await 추가)
  }

  // openapi-generator-cli 설치 확인 및 설치 함수
  async function checkAndInstallGenerator(): Promise<boolean> {
    console.log('\n--- openapi-generator-cli 설치 확인 중 ---');
    try {
      // 간단한 명령 (예: version) 실행 시도
      await execPromise('openapi-generator-cli version');
      console.log('openapi-generator-cli가 이미 설치되어 있습니다.');
      return true; // 이미 설치됨
    } catch (error) {
      // 명령어 실행 실패 시 (설치되지 않았을 가능성 높음)
      console.log('openapi-generator-cli가 설치되어 있지 않거나 경로에 없습니다.');
      const installConfirm = await questionAsync(
        '@openapitools/openapi-generator-cli를 전역으로 설치하시겠습니까? (y/n) ',
      );

      if (installConfirm.toLowerCase() === 'y') {
        console.log('\n--- openapi-generator-cli 전역 설치 진행중 ---');
        console.log('설치에는 시간이 다소 걸릴 수 있습니다...');
        try {
          // npm install -g 명령어 실행
          const { stdout, stderr } = await execPromise('npm install -g @openapitools/openapi-generator-cli');
          console.log('stdout:', stdout); // 설치 과정 로그 출력 (선택적)
          if (stderr) {
            console.error('stderr:', stderr); // 에러 로그 출력 (선택적)
          }
          console.log('openapi-generator-cli 전역 설치 완료.');
          return true; // 설치 성공
        } catch (installError) {
          console.error('\nopenapi-generator-cli 설치 중 오류 발생:');
          console.error(installError);
          console.error('\n설치를 진행할 수 없어 프로그램을 종료합니다.');
          return false; // 설치 실패
        }
      } else {
        console.log('\n설치를 동의하지 않아 프로그램을 종료합니다.');
        return false; // 사용자가 설치 거부
      }
    }
  }

  // Java 버전 확인 함수
  async function checkJavaVersion(): Promise<{ found: boolean; compatible: boolean; version?: string }> {
    console.log('\n--- Java Runtime 확인 중 (버전 11 이상 필요) ---');
    try {
      // java -version 명령어는 stderr로 출력하는 경우가 많음
      const { stdout, stderr } = await execPromise('java -version');
      const output = stderr || stdout; // stderr 우선 확인

      // 다양한 버전 형식 처리 (e.g., "11.0.15", "17", "1.8.0_301")
      const versionMatch = output.match(/(?:version|openjdk)\s+"?(\d+)(?:\.(\d+))?\.?_?\d*"?/i);

      if (versionMatch) {
        let majorVersionStr = versionMatch[1];
        const minorVersionStr = versionMatch[2];
        let fullVersionString = versionMatch[0]; // 매칭된 전체 문자열

        // "1.8" 같은 이전 버전 형식 처리
        if (majorVersionStr === '1' && minorVersionStr) {
          majorVersionStr = minorVersionStr;
        }

        const majorVersion = parseInt(majorVersionStr, 10);
        const versionStringForDisplay = fullVersionString.split('\n')[0]; // 첫 줄만 사용

        console.log(`Java 버전 확인됨: ${versionStringForDisplay}`);

        if (!isNaN(majorVersion)) {
          if (majorVersion >= 11) {
            console.log('호환되는 Java 버전입니다.');
            return { found: true, compatible: true, version: versionStringForDisplay };
          } else {
            console.error(`오류: Java 버전 ${majorVersion}은(는) 호환되지 않습니다. 버전 11 이상이 필요합니다.`);
            return { found: true, compatible: false, version: versionStringForDisplay };
          }
        }
      }

      // 정규식이 매칭되지 않은 경우 (예상치 못한 형식)
      console.error('오류: Java 버전을 인식할 수 없습니다. 설치 상태를 확인해주세요.');
      console.error('출력:', output);
      return { found: true, compatible: false, version: 'Unknown format' };
    } catch (error) {
      // execPromise가 에러를 던진 경우 (java 명령어를 찾지 못함 등)
      console.error('오류: Java Runtime을 찾을 수 없습니다.');
      console.error('시스템에 Java 11 이상 버전이 설치되어 있고, 환경 변수(PATH)에 등록되어 있는지 확인해주세요.');
      console.error('Java 설치 가이드: https://adoptium.net/ (OpenJDK - Temurin 추천)');
      // 에러 상세 정보 (선택적)
      // if (error instanceof Error && 'stderr' in error) {
      //    console.error('Error details:', (error as any).stderr || (error as any).stdout);
      // } else {
      //    console.error('Error details:', error);
      // }
      return { found: false, compatible: false };
    }
  }

  // --- Main Processing Logic ---
  async function processAnswers() {
    const [url, outputDir] = answers;
    let filePath = '';

    try {
      // 1. openapi-generator-cli 설치 확인
      const generatorInstalled = await checkAndInstallGenerator();
      if (!generatorInstalled) return; // 설치 실패/거부 시 종료

      // 2. Java 버전 확인
      const javaCheck = await checkJavaVersion();
      if (!javaCheck.found || !javaCheck.compatible) {
        console.error('\n필수 조건(Java 11+)이 충족되지 않아 Client 생성을 진행할 수 없습니다.');
        return; // Java 미설치 또는 버전 미호환 시 종료
      }

      // 3. Spec 파일 다운로드
      console.log('\n--- Spec 파일 다운로드 진행중 ---');
      // ... (기존 다운로드 로직과 동일) ...
      const response = await axios({
        url: url,
        method: 'GET',
        responseType: 'stream',
      });

      const fileName = path.basename(url);
      filePath = path.join(outputDir, fileName);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`디렉토리 생성: ${outputDir}`);
      }

      await new Promise<void>((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', (err) => {
          console.error('파일 다운로드 중 오류 발생:', err);
          reject(err);
        });
      });

      // 4. JSON 유효성 검사
      // ... (기존 JSON 검사 로직과 동일) ...
      let fileContent = '';
      try {
        fileContent = fs.readFileSync(filePath, 'utf-8');
        JSON.parse(fileContent);
        console.log(`다운로드 및 JSON 형식 확인 성공: ${filePath}`);
      } catch (jsonError) {
        console.error('\n다운로드한 파일이 유효한 JSON 형식이 아닙니다.');
        console.error('URL을 확인하거나 서버의 명세 파일 형식을 확인해주세요.');
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`잘못된 파일 삭제: ${filePath}`);
        }
        return;
      }

      // 5. Client 생성
      console.log('\n--- Client 생성 진행중 ---');
      const generateCommand = `openapi-generator-cli generate -i "${filePath}" -g typescript-fetch -o "${outputDir}"`;
      console.log(`실행 명령어: ${generateCommand}`);

      try {
        const { stdout, stderr } = await execPromise(generateCommand);
        console.log('\n--- 생성 결과 ---');
        // openapi-generator 로그는 stderr로 많이 나옴
        if (stderr) console.log('Generator Log:\n', stderr);
        if (stdout) console.log('STDOUT:\n', stdout); // stdout도 출력

        console.log(`\n생성이 완료되었습니다. 결과 경로: ${outputDir}`);
        console.log('\n------');
        console.log(`'DefaultAPI' 또는 생성된 API 클래스를 호출하여 사용해보세요.`);

        // 6. 생성 후 정리 작업
        // ... (기존 정리 로직과 동일) ...
        console.log('\n--- 임시 파일 정리 중 ---');
        const genDirPath = path.join(outputDir, '.openapi-generator');
        const ignorePath = path.join(outputDir, '.openapi-generator-ignore');
        const toolsPath = path.join(process.cwd(), 'openapitools.json');

        if (fs.existsSync(genDirPath)) {
          fs.rmSync(genDirPath, { recursive: true, force: true });
          console.log(`삭제: ${genDirPath}`);
        }
        if (fs.existsSync(ignorePath)) {
          fs.unlinkSync(ignorePath);
          console.log(`삭제: ${ignorePath}`);
        }
        if (fs.existsSync(toolsPath)) {
          fs.unlinkSync(toolsPath);
          console.log(`삭제: ${toolsPath}`);
        }
        console.log('정리 완료.');
      } catch (generateError) {
        console.error(`\nClient 생성 중 오류 발생:`);
        // 생성 에러 시 stderr에 원인이 있을 가능성이 높음
        if (generateError instanceof Error && 'stderr' in generateError) {
          console.error((generateError as any).stderr);
        } else {
          console.error(generateError);
        }
        console.error('\nJava 및 openapi-generator-cli 설치 상태, Spec 파일 경로 및 내용을 확인해주세요.');
      }
    } catch (err) {
      console.error('\n처리 중 예기치 않은 오류 발생:', err);
      // 다운로드 실패 등으로 filePath가 유효하지 않을 수 있음
      if (filePath && fs.existsSync(filePath)) {
        try {
          console.log(`오류 발생으로 인해 다운로드된 파일 삭제 시도: ${filePath}`);
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.error(`파일 삭제 중 오류 발생: ${unlinkErr}`);
        }
      }
    }
  }
}
