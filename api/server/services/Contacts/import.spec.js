jest.mock('@librechat/data-schemas', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));
jest.mock('~/models/Contact', () => {
  const buildSearchText = (doc) =>
    [doc.name, doc.company, doc.role, doc.email, doc.notes]
      .concat(Object.values(doc.attributes || {}))
      .filter(Boolean)
      .join(' ');
  const Contact = function () {};
  Contact.bulkWrite = jest.fn();
  Contact.buildSearchText = buildSearchText;
  return { __esModule: false, buildSearchText, default: Contact, ...Contact };
}, { virtual: true });

const { rowToDoc } = require('./import');

const USER = 'user-1';

describe('rowToDoc — chat_states CSV shape', () => {
  it('derives name from first_name + last_name when no `name` column exists', () => {
    const doc = rowToDoc(USER, {
      id: '68ff0665670f61601f7f35fb',
      chat_id: '1000321546',
      first_name: 'Maanas',
      middle_name: '',
      last_name: 'Pillay',
      email: 'maanas.pillay.1000321546@example.com',
      pincode: '302015',
      state: 'Rajasthan',
      city: 'Jaipur',
      application_status: 'LEAD-INCOME',
      company_name: '',
      designation: '',
    });

    expect(doc).not.toBeNull();
    expect(doc.name).toBe('Maanas Pillay');
    expect(doc.email).toBe('maanas.pillay.1000321546@example.com');
    expect(doc.company).toBe('');
    expect(doc.role).toBe('');
    expect(doc.attributes.pincode).toBe('302015');
    expect(doc.attributes.state).toBe('Rajasthan');
    expect(doc.attributes.application_status).toBe('LEAD-INCOME');
    expect(doc.attributes.first_name).toBeUndefined();
    expect(doc.attributes.last_name).toBeUndefined();
    expect(doc.attributes.middle_name).toBeUndefined();
  });

  it('aliases company_name → company and designation → role', () => {
    const doc = rowToDoc(USER, {
      first_name: 'Parth',
      last_name: 'Dixit',
      email: 'parth@example.com',
      company_name: 'Maharaj-Basu',
      designation: 'ISD',
    });

    expect(doc.name).toBe('Parth Dixit');
    expect(doc.company).toBe('Maharaj-Basu');
    expect(doc.role).toBe('ISD');
    expect(doc.attributes.company_name).toBeUndefined();
    expect(doc.attributes.designation).toBeUndefined();
  });

  it('includes middle_name in derived name when present', () => {
    const doc = rowToDoc(USER, {
      first_name: 'Maya',
      middle_name: 'K',
      last_name: 'More',
    });
    expect(doc.name).toBe('Maya K More');
  });

  it('imports sparse registration stubs that only have first_name + last_name', () => {
    const doc = rowToDoc(USER, {
      id: '69971770dfd08057baa385bf',
      chat_id: '1000830128',
      state_id: 'initial_state',
      first_name: 'Zashil',
      middle_name: '',
      last_name: 'Talwar',
    });
    expect(doc).not.toBeNull();
    expect(doc.name).toBe('Zashil Talwar');
    expect(doc.email).toBe('');
    expect(doc.attributes.chat_id).toBe('1000830128');
  });

  it('returns null when no name can be derived', () => {
    expect(rowToDoc(USER, { email: 'noone@example.com', city: 'Mumbai' })).toBeNull();
    expect(rowToDoc(USER, {})).toBeNull();
  });

  it('still works with the original `name,company,role,...` CSV shape', () => {
    const doc = rowToDoc(USER, {
      name: 'John Doe',
      company: 'Acme Corp',
      role: 'CTO',
      email: 'JOHN@ACME.COM',
      notes: 'Interested in AI infrastructure',
      Industry: 'AI Infrastructure',
      Location: 'San Francisco',
    });
    expect(doc.name).toBe('John Doe');
    expect(doc.company).toBe('Acme Corp');
    expect(doc.role).toBe('CTO');
    expect(doc.email).toBe('john@acme.com');
    expect(doc.notes).toBe('Interested in AI infrastructure');
    expect(doc.attributes.Industry).toBe('AI Infrastructure');
    expect(doc.attributes.Location).toBe('San Francisco');
  });

  it('header matching is case-insensitive', () => {
    const doc = rowToDoc(USER, {
      First_Name: 'Anya',
      Last_Name: 'Bhakta',
      Company_Name: 'Acme',
      DESIGNATION: 'CEO',
    });
    expect(doc.name).toBe('Anya Bhakta');
    expect(doc.company).toBe('Acme');
    expect(doc.role).toBe('CEO');
  });
});
