// src/services/ca/certHelpers.js
const forge = require('node-forge');
const { pki, md } = forge;

function subjectAttrs(commonName) {
  return [{ name: 'commonName', value: commonName }];
}

function parseSubjectCN(certOrAttrs) {
  const attrs = Array.isArray(certOrAttrs) ? certOrAttrs : certOrAttrs.subject.attributes;
  const cn = attrs.find(a => a.shortName === 'CN' || a.name === 'commonName');
  return cn ? cn.value : '';
}

function sansToJson(altNames) {
  return (altNames || []).map(a => {
    if (a.type === 1) return { type: 'email', value: a.value };
    if (a.type === 2) return { type: 'dns', value: a.value };
    if (a.type === 7) return { type: 'ip', value: a.ip };
    return { type: 'other' };
  });
}

function crlDistributionPointsExt(crlUrl) {
  if (!crlUrl) return null;
  return {
    name: 'cRLDistributionPoints',
    distributionPoints: [
      {
        fullName: [ { type: 6, value: crlUrl } ],
      },
    ],
  };
}

module.exports = {
  pki,
  md,
  subjectAttrs,
  parseSubjectCN,
  sansToJson,
  crlDistributionPointsExt,
};
