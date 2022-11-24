const busboy = require('busboy');
const { PassThrough } = require('stream');
const pass = new PassThrough();
const body = '--form-data-boundary-8e3ww4geum530nhj\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: application/octet-stream\r\n\r\n--form-data-boundary-lki4olrpaqsi2hy7\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: application/octet-stream\r\n\r\nfoobarbaz\r\n--form-data-boundary-lki4olrpaqsi2hy7--\r\n\r\n\r\n--form-data-boundary-8e3ww4geum530nhj--\r\n\r\n';

const boundary = body.split(/$/mgi)[0];
const contentType = `multipart/form-data; boundary=${boundary}`;
console.log({ contentType });
const bb = busboy({
    headers: {
        "content-type": contentType
    }
});
pass.pipe(bb);
pass.write(body);
pass.end();
bb.on('file', (name, file, info) => {
    const { filename, encoding, mimeType } = info;
    console.log(
        `File [${name}]: filename: %j, encoding: %j, mimeType: %j`,
        filename,
        encoding,
        mimeType
    );
    file.on('data', (data) => {
        console.log(`File [${name}] got ${data.length} bytes`);
    }).on('close', () => {
        console.log(`File [${name}] done`);
    });
});
bb.on('field', (name, val, info) => {
    console.log(`Field [${name}]: value: %j`, val);
});
bb.on('close', () => {
    console.log('Done parsing form!');
    // res.writeHead(303, { Connection: 'close', Location: '/' });
    // res.end();
});
