#!/usr/bin/env node
import { program } from 'commander';
import { downloadSpecFile } from './download-spec';

program.version('1.1.1').description('openapi 명세 파일로 client 함수 만들기');

program
  .command('download')
  .description('입력받은 openapi 명세 파일 url에서 파일을 다운로드 받습니다.')
  .action(downloadSpecFile);

program.parse(process.argv);
