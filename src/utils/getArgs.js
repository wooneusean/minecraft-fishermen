const getArguments = (command, username, prefix) => {
  const args = command.substr(prefix.length).match(/(".*?"|[^"\s]+)(?=\s*|\s*$)/g);

  if (!args) throw new Error('Empty arguments');

  const returnVal = { keyword: args[0], info: { commander: username, args: args.slice(1) } };

  return returnVal;
};

module.exports = getArguments;
