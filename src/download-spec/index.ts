#!/usr/bin/env node
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { exec } from 'child_process';

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

  await askQuestion(0);

  async function askQuestion(index: number) {
    if (index >= questions.length) {
      // 모든 질문이 완료된 경우
      await processAnswers();
      rl.close();
      return;
    }

    rl.question(questions[index] + ' ', (answer) => {
      answers.push(answer || defaultAnswers[index]);
      askQuestion(index + 1); // 다음 질문
    });
  }

  async function processAnswers() {
    console.log('\n--- 다운로드 진행중 ---');
    const [url, outputDir] = answers;

    try {
      const response = await axios({
        url: url,
        method: 'GET',
        responseType: 'stream',
      });

      const fileName = path.basename(url);
      const filePath = path.join(outputDir, fileName);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const writer = fs.createWriteStream(filePath, {});

      response.data.pipe(writer);

      writer.on('finish', async () => {
        try {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          JSON.parse(fileContent); // JSON 파싱 시도
          console.log(`다운로드 성공: ${filePath}`);

          console.log('\n--- Client 생성 진행중 ---');

          exec(
            `openapi-generator-cli generate -i ${filePath} -g typescript-fetch -o ${outputDir}`,
            (error, stdout, stderr) => {
              if (error) {
                console.error(`Error generating client: ${error}`);
                return;
              }
              console.log(`생성이 완료되었습니다. ${outputDir}`);
              console.log('\n------');
              console.log(`'DefaultAPI' class를 호출하여 사용해보세요.`);

              fs.rmSync(`${outputDir}/.openapi-generator`, { recursive: true, force: true });
              fs.unlinkSync(`${outputDir}/.openapi-generator-ignore`);
              fs.unlinkSync(`${process.cwd()}/openapitools.json`);
              rl.close();
            },
          );
        } catch (jsonError) {
          fs.unlinkSync(filePath); // JSON 형식이 아니므로 파일 삭제
          console.error('json 형식의 파일을 다운로드받을 수 있는 url을 입력해주세요.');
          rl.close();
        }
      });

      writer.on('error', (err) => {
        console.error('Error downloading file:', err);
        rl.close();
      });
    } catch (err) {
      console.error('Error:', err);
      rl.close();
    }
  }
}
