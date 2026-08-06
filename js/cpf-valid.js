/* Validação CPF/CNPJ (Pix BuckPay e checkout). */
(function (g) {
  function allSameDigits(s) {
    return /^(\d)\1+$/.test(s);
  }

  function validCpf(cpf) {
    cpf = String(cpf || "").replace(/\D/g, "");
    if (cpf.length !== 11 || allSameDigits(cpf)) return false;
    var sum = 0;
    var i;
    for (i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i);
    var d1 = (sum * 10) % 11;
    if (d1 === 10) d1 = 0;
    if (d1 !== parseInt(cpf.charAt(9), 10)) return false;
    sum = 0;
    for (i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i);
    var d2 = (sum * 10) % 11;
    if (d2 === 10) d2 = 0;
    return d2 === parseInt(cpf.charAt(10), 10);
  }

  function validCnpj(cnpj) {
    cnpj = String(cnpj || "").replace(/\D/g, "");
    if (cnpj.length !== 14 || allSameDigits(cnpj)) return false;
    var w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var i;
    var sum = 0;
    for (i = 0; i < 12; i++) sum += parseInt(cnpj.charAt(i), 10) * w1[i];
    var d1 = sum % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    if (d1 !== parseInt(cnpj.charAt(12), 10)) return false;
    sum = 0;
    for (i = 0; i < 13; i++) sum += parseInt(cnpj.charAt(i), 10) * w2[i];
    var d2 = sum % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    return d2 === parseInt(cnpj.charAt(13), 10);
  }

  g.ttkIsValidDoc = function (doc) {
    var d = String(doc || "").replace(/\D/g, "");
    if (d.length === 11) return validCpf(d);
    if (d.length === 14) return validCnpj(d);
    return false;
  };
})(typeof window !== "undefined" ? window : {});
