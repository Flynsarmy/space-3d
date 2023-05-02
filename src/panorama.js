// jshint -W097
// jshint undef: true, unused: true
/* globals require,document,__dirname,Float32Array,module*/

"use strict";

var fs = require("fs");
var glm = require("gl-matrix");
var webgl = require("./webgl.js");
var util = require("./util.js");
var rng = require("rng");

var NSTARS = 100000;

module.exports = function(width, height) {
  var self = this;

  self.initialize = function() {
    self.width = width * 3;
    self.height = height * 3;

    // Initialize the offscreen rendering canvas.
    self.canvas = document.createElement("canvas");
    self.canvas.width = self.width;
    self.canvas.height = self.height;

    // Initialize the gl context.
    self.gl = self.canvas.getContext("webgl2");
    // self.gl.enable(self.gl.BLEND);
    // self.gl.blendFuncSeparate(
    //   self.gl.SRC_ALPHA,
    //   self.gl.ONE_MINUS_SRC_ALPHA,
    //   self.gl.ZERO,
    //   self.gl.ONE
    // );


    // Load the programs.
    self.Shader = initializeShader(
      self.gl,
      fs.readFileSync(__dirname + "/glsl/panorama/vertex-shader.glsl", "utf8"),
      fs.readFileSync(__dirname + "/glsl/panorama/fragment-shader.glsl", "utf8")
    );

    var vertices = new Float32Array([
      -1.0, 1.0, 0.0,
      -1.0, -1.0, 0.0,
      1.0, -1.0, 0.0,
      1.0, 1.0, 0.0,
    ]);
    var indices = [0, 1, 2, 2, 3, 0];
    var vertexbuffer = self.gl.createBuffer();
    var indexbuffer = self.gl.createBuffer();
    self.gl.bindBuffer(self.gl.ARRAY_BUFFER, vertexbuffer);
    self.gl.bufferData(self.gl.ARRAY_BUFFER, new Float32Array(vertices), self.gl.STATIC_DRAW);
    self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
    self.gl.bindBuffer(self.gl.ELEMENT_ARRAY_BUFFER, indexbuffer);
    self.gl.bufferData(self.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), self.gl.STATIC_DRAW);
    self.gl.bindBuffer(self.gl.ELEMENT_ARRAY_BUFFER, null);
    self.gl.bindBuffer(self.gl.ARRAY_BUFFER, vertexbuffer);
    self.gl.bindBuffer(self.gl.ELEMENT_ARRAY_BUFFER, indexbuffer);
    self.gl.viewport(0, 0, self.width, self.height);
    var coords = self.gl.getAttribLocation(self.Shader, "a_Position");
    self.gl.vertexAttribPointer(coords, 3, self.gl.FLOAT, false, 0, 0);
    self.gl.enableVertexAttribArray(coords);
  };

  self.download = function() {
      var timex = self.width;

      self.gl.clearColor(0.0, 0.0, 0.0, 1.0);
      self.gl.clear(self.gl.COLOR_BUFFER_BIT);
      self.gl.useProgram(self.Shader);
      self.gl.uniform1f(self.gl.getUniformLocation(self.Shader, "u_time"), timex);
      self.gl.uniform2f(self.gl.getUniformLocation(self.Shader, "u_resolution"), self.width, self.height);
      self.gl.uniform2f(self.gl.getUniformLocation(self.Shader, "u_mouse"), 0, 0);
      self.gl.uniform1i(self.gl.getUniformLocation(self.Shader, "ef_sqrt"), 0);
      self.gl.uniform1i(self.gl.getUniformLocation(self.Shader, "ef_pow"), 0);
      self.gl.uniform1i(self.gl.getUniformLocation(self.Shader, "stop_mov"), 1);
      self.gl.uniform1i(self.gl.getUniformLocation(self.Shader, "sphere_map"), 0);
      //self.gl.bindTexture(self.gl.TEXTURE_CUBE_MAP, cubemap_tex);


      if (self.cubemapTex) {
        self.gl.deleteTexture(self.cubemapTex);
      } else {
        self.cubemapTex = self.gl.createTexture();
        self.gl.bindTexture(self.gl.TEXTURE_CUBE_MAP, self.cubemapTex);
      }

      self.gl.uniform1i(self.gl.getUniformLocation(self.Shader, 'u_cubemap1'), 0);

      loadCubemap(self.gl);

      self.gl.drawElements(self.gl.TRIANGLES, 6, self.gl.UNSIGNED_SHORT, 0);

      var canvas = self.canvas;
      var MIME_TYPE = "image/png";
      var imgURL = canvas.toDataURL(MIME_TYPE);
      var dlLink = document.createElement('a');
      dlLink.download = "panorama_image.png";
      dlLink.href = imgURL;
      dlLink.dataset.downloadurl = [MIME_TYPE, dlLink.download, dlLink.href].join(':');
      document.body.appendChild(dlLink);
      dlLink.click();
      document.body.removeChild(dlLink);
  }

  self.initialize();
};

function initializeShader(gl, source_vs, source_frag)
{
    var ErrorMessage = "Initializing Shader Program";
    var shader_vs = gl.createShader(gl.VERTEX_SHADER);
    var shader_frag = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(shader_vs, source_vs);
    gl.shaderSource(shader_frag, source_frag);
    gl.compileShader(shader_vs);
    gl.compileShader(shader_frag);
    var error = false;
    if (!gl.getShaderParameter(shader_vs, gl.COMPILE_STATUS)) {
        ErrorMessage += gl.getShaderInfoLog(shader_vs);
        error = true;
    }
    if (!gl.getShaderParameter(shader_frag, gl.COMPILE_STATUS)) {
        ErrorMessage += gl.getShaderInfoLog(shader_frag);
        error = true;
    }
    var program = gl.createProgram();
    var ret = gl.getProgramInfoLog(program);
    if (ret != "")
        ErrorMessage += ret;
    gl.attachShader(program, shader_vs);
    gl.attachShader(program, shader_frag);
    if (gl.linkProgram(program) == 0) {
        ErrorMessage += "\r\ngl.linkProgram(program) failed with error code 0.";
        error = true;
    }
    if (error) {
        console.log(ErrorMessage + ' ...failed to initialize shader.');
        return false;
    } else {
        console.log(ErrorMessage + ' ...shader successfully created.');
        return program;
    }
}


function loadCubemap(gl, resolution) {
  const back_tex = document.getElementById('texture-left');
  const top_tex = document.getElementById('texture-top');
  const right_tex = document.getElementById('texture-front');
  const bottom_tex = document.getElementById('texture-bottom');
  const front_tex = document.getElementById('texture-right');
  const left_tex = document.getElementById('texture-back');
  const width = left_tex.width;
  const height = left_tex.height;
  var dataTypedArray;

  dataTypedArray = new Uint8Array(rotate_img(left_tex, 0));
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataTypedArray);

  dataTypedArray = new Uint8Array(rotate_img(right_tex, 0));
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataTypedArray);

  dataTypedArray = new Uint8Array(rotate_img(top_tex, 90));
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataTypedArray);

  dataTypedArray = new Uint8Array(rotate_img(bottom_tex, -90));
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataTypedArray);

  dataTypedArray = new Uint8Array(rotate_img(front_tex, 0));
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataTypedArray);

  dataTypedArray = new Uint8Array(rotate_img(back_tex, 0));
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataTypedArray);

  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
};

var ctmp = document.createElement("canvas");
function rotate_img(img, angle) {
    ctmp.width = img.width;
    ctmp.height = img.height;
    var ctx = ctmp.getContext("2d");
    ctx.translate(ctmp.width/2,ctmp.height/2);
    ctx.rotate(angle*Math.PI/180);
    ctx.drawImage(img, -img.width/2, -img.width/2);
    ctx.restore();
    var imageData = ctx.getImageData(0,0,img.width,img.height);
    return imageData.data.buffer;
}