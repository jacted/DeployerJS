# DeployerJS (EXPERIMENTAL)

Ftp a git repo to a remote ftp destination.

## Flow

1. Clones git repo
2. Parses git repo directory to get directories and files to create/upload
3. Cleans all remote files
4. Creates all directories on remote ftp
5. Upload all files to remote ftp

## Todo

- [ ] Add tests
- [ ] Git webhook integration