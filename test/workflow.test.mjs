import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planFeature, verifyFeature, testFeature } from '../scripts/port.mjs';
const fixture=(_name,file)=>JSON.parse(readFileSync(new URL('../examples/'+file,import.meta.url),'utf8'));
function directory(t){const root=mkdtempSync(join(tmpdir(),'dsh-flow-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function swiftFixture(t){const root=directory(t);writeFileSync(join(root,'Feature.tsx'),'export const answer = 42;\n');mkdirSync(join(root,'native'));writeFileSync(join(root,'native/Feature.swift'),'import SwiftUI\n');mkdirSync(join(root,'App.xcodeproj'));const contract=planFeature({sourceFiles:['Feature.tsx'],targetDir:'native',expectedSwiftFiles:['Feature.swift'],behaviors:[{id:'answer',description:'Shows answer'}],testNames:['AppTests/FeatureTests']},root);return{root,contract};}

test('SwiftUI verification catches source or target changes without claiming behavioral parity',t=>{
  const{root,contract}=swiftFixture(t);assert.equal(verifyFeature(contract,root).structuralPass,true);assert.equal(verifyFeature(contract,root).behavioralParity,'not-established');writeFileSync(join(root,'Feature.tsx'),'changed');assert.equal(verifyFeature(contract,root).structuralPass,false);
});

test('SwiftUI Xcode receipts match current target files and become stale after edits',async t=>{
  const{root,contract}=swiftFixture(t);const calls=[];const receipt=await testFeature(contract,root,{project:'App.xcodeproj',scheme:'App',runner:async(exe,args)=>{calls.push([exe,args]);return{exitCode:0,timedOut:false};}});assert.equal(receipt.status,'passed');assert.ok(calls[1][1].includes('-only-testing:AppTests/FeatureTests'));assert.equal(verifyFeature(contract,root,receipt).testsPass,true);writeFileSync(join(root,'native/Feature.swift'),'import SwiftUI\n// changed\n');assert.equal(verifyFeature(contract,root,receipt).receiptCurrent,false);
});

test('SwiftUI missing toolchain is blocked, not a successful test',async t=>{
  const{root,contract}=swiftFixture(t);const receipt=await testFeature(contract,root,{project:'App.xcodeproj',scheme:'App',runner:async()=>{const error=new Error('missing');error.code='ENOENT';throw error;}});assert.equal(receipt.status,'blocked');assert.equal(receipt.reason,'XCODE_TOOLCHAIN_UNAVAILABLE');
});
