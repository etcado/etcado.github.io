let tourismus = 'https://erdermus.github.io/tourismus.csv';
let flugverkehr = 'https://erdermus.github.io/flugverkehr.csv';
let arbeitsmarkt = 'https://erdermus.github.io/arbeitsmarkt.csv';

let margin = {top: 100, right: 50, bottom: 50, left: 60};
let width = 600;
let height = 400;

// ----- svg for trousim-data -----
let svg = d3.select('#tourism-data').append('svg')
    .attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('viewBox', [0, 0, width, height]).attr('transform', `translate(${60}, ${margin.top-margin.bottom})`);

// ----- svg for air-data -----
let svg2 = d3.select('#air-data')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('viewBox', [0, 0, width, height])
    .attr('transform', `translate(${60}, ${margin.top-margin.bottom})`);

// ----- svg for market-data -----
let svg3 = d3.select('#market-data')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('viewBox', [0, 0, width, height])
    .attr('transform', `translate(${60}, ${margin.top-margin.bottom})`);

// load all csv-data files and stores it into parameter 'data' -> data = [tourismus, flugverkehr, arbeitsmarkt]
Promise.all([
    d3.csv(tourismus),
    d3.csv(flugverkehr),
    d3.csv(arbeitsmarkt)
]).then(function(data){
    // transform for each data the string values into actuel numbers
    data.forEach( d => {
        d.forEach( da => {
            da['JAHR'] = +da['JAHR'];
            da['MONAT'] = +da['MONAT'];
            da['WERT'] = +da['WERT'];
        });
    });

    // filter the data for the time period after 2019 and for 'insgemsat' as 'AUSPRÄGUNG' (for all bar plots)
    let selectedData = [];
    data.forEach( (d, i) => {
        selectedData[i] = d.filter( da => {
            return da.JAHR >= 2019 && !isNaN(da.MONAT) && da.AUSPRÄGUNG == 'insgesamt';
        });
    });

    // define months for x-axis
    let months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // ----- define axis for tourism-data (bar-plot) -----
    let x = d3.scaleBand().range([0, width]).padding(0.2);
    let y = d3.scaleLinear().range([height, 0]).domain([0, 1000000]);
    svg.append('g').call(d3.axisLeft(y));

    // ----- define axis for air-data (bar-plot) -----
    let x2 = d3.scaleBand().range([0, width]).padding(0.2);
    let y2 = d3.scaleLinear().range([height, 0]).domain([0, 4900000]);
    svg2.append('g').call(d3.axisLeft(y2))

    // ----- define axis for market-data (bar-plot) -----
    let x3 = d3.scaleBand().range([0, width]).padding(0.2);
    let y3 = d3.scaleLinear().range([height, 0]).domain([0, 49000]);
    svg3.append('g').call(d3.axisLeft(y3))
    
    /**
     * render visualization for selected year
     * @param {number} selectedYear - selected year
     * **/
    function visualize(selectedYear) {
        // filter data for new selected year (all bar-plot)
        let dataFilter1 = selectedData[0].filter( d => d.JAHR == selectedYear && d.MONATSZAHL == 'Gäste').map(function(d) {return {MONAT: d.MONAT, WERT: d.WERT}})
        let dataFilter2 = selectedData[1].filter( d => d.JAHR == selectedYear && d.MONATSZAHL == 'Fluggäste').map(function(d) {return {MONAT: d.MONAT, WERT: d.WERT}})
        let dataFilter3 = selectedData[2].filter( d => d.JAHR == selectedYear && d.MONATSZAHL == 'Arbeitslose').map(function(d) {return {MONAT: d.MONAT, WERT: d.WERT}})

        // visualization of bar plot for tourism-data
        x.domain(dataFilter1.map(function(d) { return d.MONAT; }));
        svg.append('g').attr('transform', `translate(0, ${height})`).call(d3.axisBottom(x).tickFormat((d,i) => months[i]))
            .selectAll('text').attr('transform', 'translate(-10,0)rotate(-45)').style('text-anchor', 'end');
        svg.selectAll('mybar').data(dataFilter1).enter().append('rect')
            .attr('x', function(d) { return x(d.MONAT); }).attr('y', function(d) { return y(d.WERT); })
            .attr('width', x.bandwidth()).attr('height', function(d) { return height - y(d.WERT); }).attr('fill', '#B0ABF1');
        svg.append("text").attr("text-anchor", "start").attr("y", -5).attr("x", 260).text("tourism in munich");
        let newbar = svg.selectAll('rect').data(dataFilter1);
        newbar.enter().append('rect').merge(newbar)
            .transition().duration(1000)
            .attr('class', 'rect').attr('y', function(d) { return y(+d.WERT) }).attr('fill', '#B0ABF1')
            .attr('width', x.bandwidth()).attr('height', function(d) { return height - y(d.WERT); });
        newbar.exit().remove();

        // visualization of bar plot for air-data
        x2.domain(dataFilter2.map(function(d) { return d.MONAT; }));
        svg2.append('g').attr('transform', `translate(0, ${height})`).call(d3.axisBottom(x2).tickFormat((d,i) => months[i]))
            .selectAll('text').attr('transform', 'translate(-10,0)rotate(-45)').style('text-anchor', 'end');
        svg2.selectAll('mybar').data(dataFilter2).enter().append('rect')
            .attr('x', function(d) { return x2(d.MONAT); }).attr('y', function(d) { return y2(d.WERT); })
            .attr('width', x2.bandwidth()).attr('height', function(d) { return height - y2(d.WERT); }).attr('fill', '#44CBEC');
        svg2.append("text").attr("text-anchor", "start").attr("y", -5).attr("x", 250).text("air-traffic in munich");
        let newbar2 = svg2.selectAll('rect').data(dataFilter2);
        newbar2.enter().append('rect').merge(newbar2)
            .transition().duration(1000)
            .attr('class', 'rect').attr('y', function(d) { return y2(+d.WERT) }).attr('fill', '#44CBEC')
            .attr('width', x2.bandwidth()).attr('height', function(d) { return height - y2(d.WERT); });
        newbar2.exit().remove();

        // visualization of bar plot for market-data
        x3.domain(dataFilter3.map(function(d) { return d.MONAT; }));
        svg3.append('g').attr('transform', `translate(0, ${height})`).call(d3.axisBottom(x3).tickFormat((d,i) => months[i]))
            .selectAll('text').attr('transform', 'translate(-10,0)rotate(-45)').style('text-anchor', 'end');
        svg3.selectAll('mybar').data(dataFilter3).enter().append('rect')
            .attr('x', function(d) { return x3(d.MONAT); }).attr('y', function(d) { return y3(d.WERT); })
            .attr('width', x3.bandwidth()).attr('height', function(d) { return height - y3(d.WERT); }).attr('fill', '#60AB9A');
        svg3.append("text").attr("text-anchor", "start").attr("y", -5).attr("x", 245).text("labor-market in munich");
        let newbar3 = svg3.selectAll('rect').data(dataFilter3);
        newbar3.enter().append('rect').merge(newbar3)
            .transition().duration(1000)
            .attr('class', 'rect').attr('y', function(d) { return y3(+d.WERT) }).attr('fill', '#60AB9A')
            .attr('width', x3.bandwidth()).attr('height', function(d) { return height - y3(d.WERT); });
        newbar3.exit().remove();
    }
    
    d3.select('#years').on('change', function(d) {
        let selectedYear = d3.select(this).property('value')
        visualize(selectedYear)
    });

    visualize(2019);
    svg.node();
});

function selectedYear(elem) {
    let options = document.getElementById('tickyear').getElementsByTagName('option');
    let value = [];
    for (let i = 0; i < options.length; i+=1) {
        value.push(options[i].value);
    }
    const result = document.querySelector('.year-content');
    result.textContent = elem.value;
}