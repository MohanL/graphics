var cubeRotation = 0.1;

function initializeWebGL(canvasName) {
    var canvas = $("#" + canvasName);
    // Getting WebGL context the right way
    var gl = null;
    try {
        gl = canvas[0].getContext("experimental-webgl");
        if (!gl) {
            gl = canvas[0].getContext("webgl");
        }
    } catch (error) {
        // NO-OP
    }
    if (!gl) {
        alert("Could not get WebGL context!");
        throw new Error("Could not get WebGL context!");
    }
    return gl;
}

function createShader(gl, shaderScriptId) {
    var shaderScript = $("#" + shaderScriptId);
    var shaderSource = shaderScript[0].text;
    var shaderType = null;
    if (shaderScript[0].type == "x-shader/x-vertex") {
        shaderType = gl.VERTEX_SHADER;
    } else if (shaderScript[0].type == "x-shader/x-fragment") {
        shaderType = gl.FRAGMENT_SHADER;
    } else {
        throw new Error("Invalid shader type: " + shaderScript[0].type)
    }
    var shader = gl.createShader(shaderType);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var infoLog = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        alert("An error occurred compiling the shader: " +  shaderScriptId);
        throw new Error("An error occurred compiling the shader: " + infoLog);
    } else {
        return shader;
    }
}

function createGlslProgram(gl, vertexShaderId, fragmentShaderId) {
    var program = gl.createProgram();
    gl.attachShader(program, createShader(gl, vertexShaderId));
    gl.attachShader(program, createShader(gl, fragmentShaderId));
    gl.linkProgram(program);
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        var infoLog = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        alert("An error occurred linking the shader");
        throw new Error("An error occurred linking the program: " + infoLog);
    } else {
        return program;
    }
}

function createShape(gl, data) {
    console.log("call createShape");
    // ----------------------------
    var shape = {};
    
    var filtered_triangleIndices = data.scene.triangleIndices.filter((e, index) => (index + 1) % 4 != 0);

    // shape.lineLen = data.scene.lineInd.length;
    shape.verticesLength = data.scene.vertexPositions.length;
    shape.triLen = filtered_triangleIndices.length;

    data.scene.draw_elements_vertexPositions = rearrangeVerticesForDrawingElements(data.scene.vertexPositions, filtered_triangleIndices);
    shape.draw_elements_vertexPositions_len = data.scene.draw_elements_vertexPositions.length/3;

    // shape.lineColor = data.scene.lineColor;
    // Note: the triangle structure is defined as [p1, p2, p3, color_index], use color_index to map to corresponding triangle color
    
    var normalData = calculateNormals(data.scene.draw_elements_vertexPositions);

    if(data.renderMode == 2){
        shape.fillColors = normalData;
    }else {
        shape.fillColors = data.scene.triangleIndices.filter((e, index) => (index + 1) % 4 == 0).reduce((total, e) => {
            var color = data.scene.triangleColors.slice(e * 3, (e + 1) * 3);
            color.push(1);
            total.push(...repeat(3, color));
            return total;
        }, []).map(e => parseFloat(e));
    }
    // ----------------------------

    shape.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shape.vertexBuffer);

    // Notes:
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.scene.draw_elements_vertexPositions), gl.STATIC_DRAW);


    // create and bind normal data
    shape.normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shape.normalBuffer);
    
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normalData), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // shape.lineIndexBuffer = gl.createBuffer();
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.lineIndexBuffer);
    // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.scene.lineInd), gl.STATIC_DRAW);
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    shape.triIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.triIndexBuffer);

    // Note: the triangle structure is defined as [p1, p2, p3, color_index]
    
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(filtered_triangleIndices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    shape.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shape.colorBuffer);

      // Pick 2 random colors.
    // var r1 = Math.random();
    // var b1 = Math.random();
    // var g1 = Math.random();
    
    // var r2 = Math.random();
    // var b2 = Math.random();
    // var g2 = Math.random();
    
    // gl.bufferData(
    //     gl.ARRAY_BUFFER,
    //     new Float32Array(
    //         [ r1, b1, g1, 1,
    //         r1, b1, g1, 1,
    //         r1, b1, g1, 1,
    //         r2, b2, g2, 1,
    //         r2, b2, g2, 1,
    //         r2, b2, g2, 1]),
    //     gl.STATIC_DRAW);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shape.fillColors), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return shape;
}

// function drawShape(gl, shape, program, xf) {
function drawShape(gl, shape, programInfo, deltaTime, drawData) {
    // ---------- EXPERIMENT ---------------
    gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
    gl.clearDepth(1.0);                 // Clear everything
    gl.enable(gl.DEPTH_TEST);           // Enable depth testing
    gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

    // Clear the canvas before we start drawing on it.

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Create a perspective matrix, a special matrix that is
    // used to simulate the distortion of perspective in a camera.
    // Our field of view is 45 degrees, with a width/height
    // ratio that matches the display size of the canvas
    // and we only want to see objects between 0.1 units
    // and 100 units away from the camera.

    const fieldOfView = (drawData.fov ? drawData.fov : 45) * Math.PI / 180;   // in radians
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const zNear = 0.1;
    const zFar = 100.0;
    const projectionMatrix = glMatrix.mat4.create();

    // // note: glmatrix.js always has the first argument
    // // as the destination to receive the result.
    glMatrix.mat4.perspective(projectionMatrix,
        fieldOfView,
        aspect,
        zNear,
        zFar);


    // var l = -1, r = 1;
    // var b = -1, t = 1; 
    // var n = 1, f = 3;

    // var projectionMatrix = glMatrix.mat4.fromValues(
    //     2*n / (r - l),      0       , (l + r) / (r - l),       0,
    //             0       , 2*n / (t - b), (b + t) / (t - b),       0,
    //             0       ,      0       , (n + f) / (n - f), 2*f*n / (n - f),
    //             0       ,      0       ,        -1        ,       0
    //     );
    // glMatrix.mat4.transpose(projectionMatrix, projectionMatrix);
    // Set the drawing position to the "identity" point, which is
    // the center of the scene.
    const viewMatrix = drawData.camera

    // Set the drawing position to the "identity" point, which is
    // the center of the scene.
    var modelMatrix = glMatrix.mat4.create();

    // // Now move the drawing position a bit to where we want to
    // // start drawing the square.

    glMatrix.mat4.translate(modelMatrix,     // destination matrix
                    modelMatrix,     // matrix to translate
                    drawData.modelTranslation);  // amount to translate
    // glMatrix.mat4.rotate(modelMatrix,  // destination matrix
    //             modelMatrix,  // matrix to rotate
    //             cubeRotation,     // amount to rotate in radians
    //             [0, 0, 1]);       // axis to rotate around (Z)
    // glMatrix.mat4.rotate(modelMatrix,  // destination matrix
    //             modelMatrix,  // matrix to rotate
    //             cubeRotation * .3,// amount to rotate in radians
    //             [0, 1, 0]);       // axis to rotate around (X)

    var xAxis = glMatrix.vec3.fromValues(1, 0, 0);
    var yAxis = glMatrix.vec3.fromValues(0, 1, 0);
    var zAxis = glMatrix.vec3.fromValues(0, 0, 1);
    glMatrix.mat4.rotate(modelMatrix, modelMatrix, drawData.modelRotation[0] * Math.PI/180, xAxis);
    glMatrix.mat4.rotate(modelMatrix, modelMatrix, drawData.modelRotation[1] * Math.PI/180, yAxis);
    glMatrix.mat4.rotate(modelMatrix, modelMatrix, drawData.modelRotation[2] * Math.PI/180, zAxis);
            

    // glMatrix.mat4.multiply(viewMatrix, viewMatrix, modelMatrix);

    // ---------- END of  EXPERIMENT ---------------

    gl.useProgram(programInfo.program);

    gl.uniformMatrix4fv(
        programInfo.uniformLocations.projectionMatrix,
        false,
        projectionMatrix);
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.viewMatrix,
        false,
        viewMatrix);
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.modelMatrix,
        false,
        modelMatrix);
    gl.uniform3fv(
        programInfo.uniformLocations.lightPosition,
        drawData.lightPosition);

    {
        gl.bindBuffer(gl.ARRAY_BUFFER, shape.vertexBuffer);
        var positionLocation = programInfo.attribLocations.vertexPosition;
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    {
        gl.bindBuffer(gl.ARRAY_BUFFER, shape.colorBuffer);
        var color = programInfo.attribLocations.vertexColor;
        gl.enableVertexAttribArray(color);
        gl.vertexAttribPointer(color, 4, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    
    {
        // Turn on the normal attribute
        gl.enableVertexAttribArray(programInfo.attribLocations.normalLocation);
        // Bind the normal buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, shape.normalBuffer);
        // Tell the attribute how to get data out of normalBuffer (ARRAY_BUFFER)
        var size = 3;          // 3 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floating point values
        var normalize = false; // normalize the data (convert from 0-255 to 0-1)
        var stride = 4*4;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            programInfo.attribLocations.normalLocation, size, type, normalize, stride, offset)
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.triIndexBuffer);
    // the colors are picked up for vertexes instead of triangles


    // gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); //shared vertices

    // Draw the geometry.
    var primitiveType = gl.TRIANGLES;
    var offset = 0;
    var count = shape.draw_elements_vertexPositions_len;
    // TODO:alternatvie solution for drawing different color on triangles with shared vertices http://learnwebgl.brown37.net/rendering/render_example_02.html
    gl.drawArrays(primitiveType, offset, count); // no shareeed vertces
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);


    // -----------------------------------------------------------
    // for (start = 0, color_index = 0; start < shap3.verticesLength; start += 3, color_index += 1) {
    //     // Set the color of the triangle
    //     gl.uniform4fv(programInfo.uniformLocations.color, shape.fillColors[color_index]);

    //     // Draw a single triangle
    //     gl.drawArrays(gl.LINE_LOOP, start, 3);
    //   }
    // -----------------------------------------------------------

    // gl.uniform3fv(gl.getUniformLocation(program, "color"), shape.lineColor);

    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.lineIndexBuffer);
    // gl.drawElements(gl.LINES, shape.lineLen, gl.UNSIGNED_SHORT, 0);
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    gl.useProgram(null);

    // cubeRotation += deltaTime;
}

function glEnv(canvas, data) {

    var gl = initializeWebGL(canvas);
    var shaderProgram = createGlslProgram(gl, "vertexShader", "fragmentShader");
    var obj = createShape(gl, data);

    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, 'position'),
            vertexColor: gl.getAttribLocation(shaderProgram, 'color'),
            normalLocation: gl.getAttribLocation(shaderProgram, 'a_normal'),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
            lightPosition: gl.getUniformLocation(shaderProgram, 'uLightPosition'),
            viewMatrix: gl.getUniformLocation(shaderProgram, 'uViewMatrix'),
            modelMatrix: gl.getUniformLocation(shaderProgram, 'uModelMatrix')
        }
    };

    var camera = glMatrix.mat4.create();

    const drawData = {
    }

    function setCamera(newCamera_mat4) {
        glMatrix.mat4.copy(camera, newCamera_mat4);
        drawData.camera = camera;
    }

    function setFOV(newFOV) {
        drawData.fov = newFOV;
    }

    function setModelTranslation(newModelTranslation) {
        drawData.modelTranslation = newModelTranslation;
    }


    function setModelRotation(newModelRotation) {
        drawData.modelRotation = newModelRotation;
    }

    function setRenderMode(newRenderMode){
        console.log("render mode set to be " + newRenderMode);
        drawData.renderMode = newRenderMode;
    }

    // TODO: complete this function
    function setLightInfo(newLightInfo) {
        drawData.lightPosition = newLightInfo.position;
        // drawData.lightIntensity = ;
    }

    function drawFrame(deltaTime) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawShape(gl, obj, programInfo, deltaTime, drawData);
    }

    return {
        setCamera: setCamera,
        setFOV: setFOV,
        setLightInfo: setLightInfo,
        setRenderMode: setRenderMode,
        setModelRotation: setModelRotation,
        setModelTranslation: setModelTranslation,
        drawFrame: drawFrame
    }
}


function getCameraEyeMatrix() {
    view = glMatrix.mat4.create();
    return glMatrix.mat4.lookAt(
        view,
        this.getCameraEye(),
        this.getCameraTarget(),
        this.getCameraUp()
    );
}

function runCanvas(canvasName, enviroment, prepareProgram) {

    var worldSpaceEnv = glEnv(canvasName, enviroment);

    worldSpaceEnv.setCamera(this.getCameraEyeMatrix());
    worldSpaceEnv.setFOV(this.getCameraFov());
    worldSpaceEnv.setLightInfo(this.getLightInfo());
    worldSpaceEnv.setModelTranslation(this.getModelTranslation());
    worldSpaceEnv.setModelRotation(this.getModelRotation());
    worldSpaceEnv.setRenderMode(this.getRenderMode());
    var then = 0;

    function updateWebGL(now) {
        now *= 0.001;  // convert to seconds
        const deltaTime = now - then;
        then = now;

        worldSpaceEnv.setCamera(this.getCameraEyeMatrix());
        worldSpaceEnv.setFOV(this.getCameraFov());
        worldSpaceEnv.setLightInfo(this.getLightInfo());
        worldSpaceEnv.setModelTranslation(this.getModelTranslation());
        worldSpaceEnv.setModelRotation(this.getModelRotation());
        worldSpaceEnv.setRenderMode(this.getRenderMode());

        worldSpaceEnv.drawFrame(deltaTime);
        // Reschedule the next frame.
        window.requestAnimationFrame(updateWebGL);
    }

    window.requestAnimationFrame(updateWebGL);
}


// Helpers
// https://math.stackexchange.com/questions/2590468/how-to-determine-the-direction-of-the-normal-of-the-plane
// http://cs.boisestate.edu/~scutchin/cs464/codesnips/normalTri.html
function find_unit_normal_outward(pt1, pt2, pt3) {
    var pt2Vec = glMatrix.vec3.create();
    var pt3Vec = glMatrix.vec3.create();
    glMatrix.vec3.sub(pt2Vec, pt2, pt1);  // calculate vector pt1-->pt2
    glMatrix.vec3.sub(pt3Vec, pt3, pt1);  // cacluate vector pt1-->pt3

    // now if we take the cross product that gives us the normal
    var normal = glMatrix.vec3.create();
    glMatrix.vec3.cross(normal, pt2Vec, pt3Vec);
    dot = glMatrix.vec3.dot(normal, pt1)
    if ( dot < 0) {
        // TODO: fix normal direction
        // glMatrix.vec3.negate(normal, normal)
    }
    return glMatrix.vec3.normalize(normal, normal)
}

// https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal

function find_unit_normal_outward2(pt1, pt2, pt3) {
    var pt2Vec = glMatrix.vec3.create();
    var pt3Vec = glMatrix.vec3.create();
    glMatrix.vec3.sub(pt2Vec, pt2, pt1);  // calculate vector pt1-->pt2
    glMatrix.vec3.sub(pt3Vec, pt3, pt1);  // cacluate vector pt1-->pt3

    // now if we take the cross product that gives us the normal
    var normal = glMatrix.vec3.create();
    glMatrix.vec3.cross(normal, pt2Vec, pt3Vec);

    if (glMatrix.vec3.dot(normal, pt1) < 0) {
        glMatrix.vec3.negate(normal, normal)
    }
    return glMatrix.vec3.normalize(normal, normal)
}


function calculateNormals(vertices){
    var normals = [];
    for(var i = 0; i < vertices.length/9; i++){

        pt1 = vertices.slice(i*9, i*9+3)
        pt2 = vertices.slice(i*9+3, i*9 + 6)
        pt3 = vertices.slice(i*9+6, i*9 + 9)

        normal_unit = find_unit_normal_outward(pt1, pt2, pt3);
        
        if (true){
            glMatrix.vec3.add(normal_unit, normal_unit, [1,1,1])
            normal_unit = normal_unit.map(e => e/2);
        }


        normal_unit = Array.from(normal_unit);

        // normal model on
        normal_unit.push(1);
        if(normal_unit == [0, 0, 0, 1]){
            debugger;
        }
        normals.push(...repeat(3, normal_unit));
    }
    return normals;
}




// Construct an Array by repeating `pattern` n times
function repeat(n, pattern) {
    return [...Array(n)].reduce(sum => sum.concat(pattern), []);
}

// sample: [pt1, pt2, pt3, pt4], (012,023) => [pt1,pt2,pt3  pt1,pt3,pt4]
// reason is drawElements doesnt take care of the indices
function rearrangeVerticesForDrawingElements(vertices, indices){
    let sum = []
    for (const i of indices) sum.push(...vertices.slice(i*3, i*3+3))
    return sum;
}