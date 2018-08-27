const input = require("./data/input.json");
const fs = require("fs");

class Output {
  constructor() {
    this.schedule = {};
    this.consumedEnergy = { value: 0, devices: {} };
  }
}

class ScheduleRecord {
  constructor(device, startingHour) {
    this.device = device;
    this.startingHour = startingHour;
  }
}

const hours = 24;
const ratesByHours = []; // Здесь будут хранится тарифы по часам
const { rates, maxPower } = input;
let newRecords = [];

const flatten = function(arr, result = []) {
  for (let i = 0, length = arr.length; i < length; i++) {
    const value = arr[i];
    if (Array.isArray(value)) {
      flatten(value, result);
    } else {
      result.push(value);
    }
  }
  return result;
};
//Сортировка массива по работе в сутки от максимального к минимальному
let devices = input.devices.sort((a, b) => b.duration - a.duration);
setDevicesFromField(devices);
setDevicesToField(devices);
fillRates(ratesByHours, rates);

function setDevicesFromField(devices) {
  devices.forEach(device => {
    if (device.mode === "day") {
      return (device.from = 7);
    } else if (device.mode === "night") {
      return (device.from = 21);
    } else {
      return (device.from = 0);
    }
  });
}

function setDevicesToField(devices) {
  devices.forEach(device => {
    if (device.mode === "day") {
      return (device.to = 21);
    } else if (device.mode === "night") {
      return (device.to = 7);
    } else {
      return (device.to = 23);
    }
  });
}

function start() {
  fillRates(ratesByHours, input.rates);
  setDevicesFromField(devices);
  setDevicesToField(devices);

  //Рекурсивно заполняем расписание попутно находя оптимальную цену
  let schedule = fillSchedule(devices, new Array());
  //Генерим выходные данные
  let output = JSON.stringify(generateOutput(schedule));
  fs.writeFile("./output.json", output, err => {
    if (!err) {
      console.log("output.json file is written");
    }
  });
  console.log(output);
}

function generateOutput(schedule) {
  let output = new Output();

  for (let h = 0; h < hours; h++) {
    output.schedule[h.toString()] = [];
  }
  schedule.forEach(r => {
    let energy = 0;
    for (let i = r.startingHour; i < r.startingHour + r.device.duration; i++) {
      let hour = i % hours;
      output.schedule[hour.toString()].push(r.device.id);
      energy += ratesByHours[hour] * r.device.power * 0.001;
    }
    output.consumedEnergy.value += energy;
    output.consumedEnergy.devices[r.device.id] = energy;
  });

  return output;
}

function getPrice(records) {
  let price = 0;
  records.forEach(record => {
    for (
      let i = record.startingHour;
      i < record.startingHour + record.device.duration;
      i++
    ) {
      price += ratesByHours[i % hours] * (record.device.power * 0.001);
    }
  });
  return price;
}

function getRemainingPowerAtHour(hour, records) {
  let power = 0;
  records.forEach(r => {
    if (hour >= r.startingHour) {
      power += r.device.power;
    }
  });
  return maxPower - power;
}

function fillSchedule(devices, records) {
  debugger;
  //Если не осталось девайсов возвращаем расписание
  if (devices.length == 0) {
    return records;
  }

  //Создаем запись расписания для текущего девайса
  let device = devices[0];
  let remainDevices = devices;
  remainDevices.shift(); //Удаляем девайс с начала массива

  let maxStartTime = device.to - device.duration;
  if (maxStartTime < device.from) {
    maxStartTime += hours;
  }
  let record = new ScheduleRecord(device, device.from);
  let lowestSchedule = null;
  let minPrice = 100000000000; // большое значение
  let startingHour = device.from;
  newRecords = flatten(new Array(records));
  newRecords.push(record);

  //Пробуем все возможные времена
  for (let i = device.from; i < maxStartTime; i++) {
    let canAdd = true;
    // Проверяем хватит ли энергии на каждом из часов работы
    for (let h = 0; h < device.duration; h++) {
      if (getRemainingPowerAtHour(i + h, records) < device.power) {
        canAdd = false;
        break;
      }
    }
    if (!canAdd) {
      continue;
    }
    record.startingHour = i;
    //Спускаемся рекурсивно, чтобы добавить следующий девайс
    let filledSchedule = fillSchedule(remainDevices, newRecords);
    if (filledSchedule != null) {
      let price = getPrice(filledSchedule);
      //Если это минимальная цена, запоминаем текущее расписание
      if (price < minPrice) {
        startingHour = i;
        minPrice = price;
        lowestSchedule = filledSchedule;
      }
    }
  }
  record.startingHour = startingHour;
  return lowestSchedule;
}

function fillRates(ratesByHours, rates) {
  rates.forEach(rate => {
    let to = rate.to;
    if (to < rate.from) {
      to += hours;
    }
    for (let i = rate.from; i < to; i++) {
      ratesByHours[i % hours] = rate.value;
    }
  });
  return ratesByHours;
}

start();
