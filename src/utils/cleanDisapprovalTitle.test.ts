import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { cleanDisapprovalTitle, DISAPPROVAL_PREFIX } from './cleanDisapprovalTitle.js';

describe('cleanDisapprovalTitle', () => {
  it('returns shortened form when name and quoted action are present', () => {
    const title =
      'Providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Bureau of Land Management relating to "North Dakota Field Office Record of Decision and Approved Resource Management Plan".';
    assert.equal(
      cleanDisapprovalTitle(title),
      'Disapproval of Bureau of Land Management rule on the North Dakota Field Office Record of Decision and Approved Resource Management Plan'
    );
  });

  it('returns original when title does not start with disapproval prefix', () => {
    const title = 'A bill to amend something.';
    assert.equal(cleanDisapprovalTitle(title), title);
  });

  it('returns original when prefix matches but "relating to" quoted action is missing', () => {
    const title = `${DISAPPROVAL_PREFIX}, United States Code, of the rule submitted by the EPA relating to water quality.`;
    assert.equal(cleanDisapprovalTitle(title), title);
  });

  it('returns original when "the rule submitted by the" phrase is missing', () => {
    const title = `${DISAPPROVAL_PREFIX}, United States Code, of something else relating to "Some Rule".`;
    assert.equal(cleanDisapprovalTitle(title), title);
  });

  it('allows optional "the " before the quoted action', () => {
    const title = `${DISAPPROVAL_PREFIX} of the rule submitted by the SEC relating to the "Disclosure Rule".`;
    assert.equal(cleanDisapprovalTitle(title), 'Disapproval of SEC rule on the Disclosure Rule');
  });

  it('allows extra spaces between words (real-world API spacing)', () => {
    const title = `${DISAPPROVAL_PREFIX} of the  rule  submitted  by the  FDA relating  to "Food Safety Rule".`;
    assert.equal(cleanDisapprovalTitle(title), 'Disapproval of FDA rule on the Food Safety Rule');
  });

  it('returns original for empty or non-string input', () => {
    assert.equal(cleanDisapprovalTitle(''), '');
    assert.equal(cleanDisapprovalTitle(null as unknown as string), null as unknown as string);
    assert.equal(cleanDisapprovalTitle(undefined as unknown as string), undefined as unknown as string);
  });

  it('returns original when both name and action would be empty after trim', () => {
    const title = `${DISAPPROVAL_PREFIX} of the rule submitted by the   relating to "".`;
    assert.equal(cleanDisapprovalTitle(title), title);
  });

  it('handles agency name with "and" (e.g. Securities and Exchange Commission)', () => {
    const title = `${DISAPPROVAL_PREFIX}, United States Code, of the rule submitted by the Securities and Exchange Commission relating to "Share Repurchase Disclosure".`;
    assert.equal(
      cleanDisapprovalTitle(title),
      'Disapproval of Securities and Exchange Commission rule on the Share Repurchase Disclosure'
    );
  });

  it('handles trailing period after closing quote', () => {
    const title = `${DISAPPROVAL_PREFIX} of the rule submitted by the DOE relating to "Energy Efficiency Standards.".`;
    assert.equal(cleanDisapprovalTitle(title), 'Disapproval of DOE rule on the Energy Efficiency Standards.');
  });

  it('matches "Providing congressional disapproval" (no "for") e.g. congress.gov variant', () => {
    const title =
      'Providing congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Environmental Protection Agency relating to "Waste Emissions Charge for Petroleum and Natural Gas Systems: Procedures for Facilitating Compliance, Including Netting and Exemptions".';
    assert.equal(
      cleanDisapprovalTitle(title),
      'Disapproval of Environmental Protection Agency rule on the Waste Emissions Charge for Petroleum and Natural Gas Systems: Procedures for Facilitating Compliance, Including Netting and Exemptions'
    );
  });

  it('matches EPA with "for" (Environmental Protection Agency)', () => {
    const title = `${DISAPPROVAL_PREFIX}, United States Code, of the rule submitted by the Environmental Protection Agency relating to "National Emission Standards for Hazardous Air Pollutants: Rubber Tire Manufacturing".`;
    assert.equal(
      cleanDisapprovalTitle(title),
      'Disapproval of Environmental Protection Agency rule on the National Emission Standards for Hazardous Air Pollutants: Rubber Tire Manufacturing'
    );
  });

  it('matches SJRes "A joint resolution providing for congressional disapproval..."', () => {
    const title =
      'A joint resolution providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Internal Revenue Service relating to "Interim Guidance Simplifying Application of the Corporate Alternative Minimum Tax to Partnerships".';
    assert.equal(
      cleanDisapprovalTitle(title),
      'Disapproval of Internal Revenue Service rule on the Interim Guidance Simplifying Application of the Corporate Alternative Minimum Tax to Partnerships'
    );
  });

  it('matches exact SJRes title from editorial 119/sjres/11 (Bureau of Ocean Energy Management)', () => {
    const title =
      'A joint resolution providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Bureau of Ocean Energy Management relating to "Protection of Marine Archaeological Resources".';
    assert.equal(
      cleanDisapprovalTitle(title),
      'Disapproval of Bureau of Ocean Energy Management rule on the Protection of Marine Archaeological Resources'
    );
  });

  it('matches SJRes short form "disapproving the rule submitted by the" (e.g. 119/sjres/18 CFPB)', () => {
    const title =
      'A joint resolution disapproving the rule submitted by the Bureau of Consumer Financial Protection relating to "Overdraft Lending: Very Large Financial Institutions".';
    assert.equal(
      cleanDisapprovalTitle(title),
      'Disapproval of Bureau of Consumer Financial Protection rule on the Overdraft Lending: Very Large Financial Institutions'
    );
  });
});
