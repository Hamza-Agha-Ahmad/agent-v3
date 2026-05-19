import React from "react";

function LogoUpload() {
  return (
    <section id="logo" className="mb-6 bg-white p-4 rounded shadow">
      <h2 className="text-xl font-semibold mb-2">Upload Company Logo</h2>
      <input
        type="file"
        accept="image/*"
        className="border p-2 rounded text-sm"
      />
    </section>
  );
}

export default LogoUpload;